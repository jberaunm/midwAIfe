"""
Chat Services for Message Persistence and Greeting Generation
"""

from datetime import datetime, date
from typing import Optional, List, Dict, Any
from db.pg_database import execute_query


def get_today_meals(user_id: str) -> Dict[str, Any]:
    """
    Get meals logged today for the user.

    Args:
        user_id: User ID

    Returns:
        Dictionary with today's meal information
    """
    today = date.today().strftime('%Y-%m-%d')

    query = """
        SELECT
            m.meal_type,
            f.name as food_name,
            f.rainbow_color
        FROM meals m
        JOIN meal_items mi ON m.id = mi.meal_id
        JOIN foods f ON mi.food_id = f.id
        WHERE m.user_id = %s
            AND m.log_date = %s
        ORDER BY
            CASE m.meal_type
                WHEN 'breakfast' THEN 1
                WHEN 'lunch' THEN 2
                WHEN 'dinner' THEN 3
                WHEN 'snacks' THEN 4
            END,
            f.name
    """

    results = execute_query(query, (user_id, today), fetch_one=False)

    if not results:
        return {
            "has_meals": False,
            "meal_count": 0,
            "food_count": 0,
            "foods_by_meal": {},
            "unique_colors": []
        }

    # Organize by meal type
    foods_by_meal = {}
    all_foods = []
    colors = set()

    for row in results:
        meal_type = row['meal_type']
        food_name = row['food_name']
        rainbow_color = row['rainbow_color']

        if meal_type not in foods_by_meal:
            foods_by_meal[meal_type] = []

        foods_by_meal[meal_type].append(food_name)
        all_foods.append(food_name)

        if rainbow_color:
            colors.add(rainbow_color)

    return {
        "has_meals": True,
        "meal_count": len(foods_by_meal),
        "food_count": len(all_foods),
        "foods_by_meal": foods_by_meal,
        "unique_colors": sorted(list(colors)),
        "sample_foods": all_foods[:3]  # First 3 foods for mention
    }


def save_message(
    user_id: str,
    session_id: str,
    role: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Save a chat message to the database.

    Args:
        user_id: User ID
        session_id: Session ID
        role: Message role ('user', 'model', 'system')
        content: Message content
        metadata: Optional metadata dict

    Returns:
        Saved message dict with id and created_at
    """
    import json

    query = """
        INSERT INTO chat_messages (user_id, session_id, role, content, metadata)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, user_id, session_id, role, content, message_date, created_at, metadata
    """

    metadata_json = json.dumps(metadata or {})

    result = execute_query(
        query,
        (user_id, session_id, role, content, metadata_json),
        fetch_one=True
    )

    return {
        "id": str(result['id']),
        "user_id": str(result['user_id']),
        "session_id": result['session_id'],
        "role": result['role'],
        "content": result['content'],
        "message_date": str(result['message_date']),
        "created_at": str(result['created_at']),
        "metadata": result.get('metadata', {})
    }


def get_today_greeting(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Check if a greeting has already been sent today.

    Args:
        user_id: User ID

    Returns:
        Greeting message dict if exists, None otherwise
    """
    query = """
        SELECT id, user_id, session_id, role, content, message_date, created_at, metadata
        FROM chat_messages
        WHERE user_id = %s
          AND message_date = CURRENT_DATE
          AND role = 'system'
          AND metadata->>'is_greeting' = 'true'
        ORDER BY created_at DESC
        LIMIT 1
    """

    result = execute_query(query, (user_id,), fetch_one=True)

    if not result:
        return None

    return {
        "id": str(result['id']),
        "user_id": str(result['user_id']),
        "session_id": result['session_id'],
        "role": result['role'],
        "content": result['content'],
        "message_date": str(result['message_date']),
        "created_at": str(result['created_at']),
        "metadata": result.get('metadata', {})
    }


def get_recent_messages(
    user_id: str,
    limit: int = 50,
    since_date: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get recent chat messages for a user.

    Args:
        user_id: User ID
        limit: Maximum number of messages to return
        since_date: Optional date to filter messages from (YYYY-MM-DD)

    Returns:
        List of message dicts ordered by creation time
    """
    if since_date:
        query = """
            SELECT id, user_id, session_id, role, content, message_date, created_at, metadata
            FROM chat_messages
            WHERE user_id = %s
              AND message_date >= %s
            ORDER BY created_at ASC
            LIMIT %s
        """
        params = (user_id, since_date, limit)
    else:
        query = """
            SELECT id, user_id, session_id, role, content, message_date, created_at, metadata
            FROM chat_messages
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT %s
        """
        params = (user_id, limit)

    results = execute_query(query, params, fetch_one=False)

    if not results:
        return []

    messages = []
    for row in results:
        messages.append({
            "id": str(row['id']),
            "user_id": str(row['user_id']),
            "session_id": row['session_id'],
            "role": row['role'],
            "content": row['content'],
            "message_date": str(row['message_date']),
            "created_at": str(row['created_at']),
            "metadata": row.get('metadata', {})
        })

    # If we did DESC order, reverse to get chronological
    if not since_date:
        messages.reverse()

    return messages


async def generate_daily_greeting_async(user_id: str) -> str:
    """
    Generate a personalized daily greeting using the AI agent (async version).

    The agent will use its tools to understand the user's context and
    generate a natural, personalized greeting.

    Args:
        user_id: User ID

    Returns:
        Greeting message text
    """
    try:
        from midwaife.routes import call_agent_async

        # Get current hour for context
        hour = datetime.now().hour
        if hour < 12:
            time_of_day = "morning"
        elif hour < 18:
            time_of_day = "afternoon"
        else:
            time_of_day = "evening"

        prompt = f"DAILY_GREETING: {time_of_day}"

        # Ensure session is initialized and set user_id in session state
        from midwaife.routes import session_service, APP_NAME, ensure_session_initialized

        try:
            # Initialize session if not already done
            await ensure_session_initialized()

            # Get session and set user_id in state
            session = await session_service.get_session(
                app_name=APP_NAME,
                user_id="default_user",
                session_id="default_session"
            )
            if session:
                session.state["user_id"] = user_id
                print(f"Set user_id {user_id} in session state")
        except Exception as e:
            print(f"Warning: Could not set user_id in session state: {e}")

        # Use the existing call_agent_async function with default session
        greeting = await call_agent_async(
            query=prompt,
            user_id="default_user",  # Use default ADK session user
            session_id="default_session"
        )

        return greeting.strip()

    except Exception as e:
        # Fallback greeting if agent fails
        print(f"Error generating AI greeting: {e}")
        import traceback
        traceback.print_exc()
        return f"Hello! How can I help you with your pregnancy nutrition today?"


def generate_daily_greeting(user_id: str) -> str:
    """
    Synchronous wrapper for generate_daily_greeting_async.

    Args:
        user_id: User ID

    Returns:
        Greeting message text
    """
    import asyncio
    try:
        # Check if we're already in an async context
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're in an async context, can't use asyncio.run
            # Create a new event loop in a thread instead
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, generate_daily_greeting_async(user_id))
                return future.result()
        else:
            # Not in async context, safe to use asyncio.run
            return asyncio.run(generate_daily_greeting_async(user_id))
    except Exception as e:
        print(f"Error in synchronous wrapper: {e}")
        import traceback
        traceback.print_exc()
        return f"Hello! How can I help you with your pregnancy nutrition today?"


def get_or_create_daily_greeting(user_id: str, session_id: str) -> Dict[str, Any]:
    """
    Get today's greeting if it exists, or generate and save a new one.

    Args:
        user_id: User ID
        session_id: Current session ID

    Returns:
        Greeting message dict
    """
    # Check if greeting already exists today
    existing_greeting = get_today_greeting(user_id)

    if existing_greeting:
        return existing_greeting

    # Generate new greeting
    greeting_content = generate_daily_greeting(user_id)

    # Save to database
    greeting_message = save_message(
        user_id=user_id,
        session_id=session_id,
        role='system',
        content=greeting_content,
        metadata={'is_greeting': True, 'generated_at': str(datetime.now())}
    )

    return greeting_message
