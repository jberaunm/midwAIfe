"""
User Data Tools for Midwaife Agent

These tools allow the agent to access user information including:
- Current pregnancy week
- Due date
- Dietary restrictions
- Foods consumed during the current week
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from db.pg_database import execute_query


def calculate_pregnancy_week(due_date: str) -> int:
    """
    Calculate current pregnancy week from due date.

    Args:
        due_date: ISO format date string (YYYY-MM-DD)

    Returns:
        Current pregnancy week (1-42)
    """
    if not due_date:
        return 14  # Default fallback

    due = datetime.fromisoformat(due_date.split('T')[0])
    today = datetime.now()

    # Calculate days difference
    diff_days = (due - today).days

    # Full term is 280 days (40 weeks)
    days_pregnant = 280 - diff_days
    weeks_pregnant = days_pregnant // 7

    # Clamp between 1 and 42 weeks
    return max(1, min(42, weeks_pregnant))


def get_user_info_tool(user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get user information including pregnancy details.

    This tool fetches:
    - First name
    - Current pregnancy week
    - Due date
    - Dietary restrictions
    - Caffeine limit

    Args:
        user_id: User ID (optional, will be retrieved from session context if not provided)

    Returns:
        Dictionary with user information
    """
    # If no user_id provided, try to get from session context
    if user_id is None:
        try:
            from google.adk.sessions import get_current_session
            session = get_current_session()
            user_id = session.state.get("user_id", "00000000-0000-0000-0000-000000000001")
        except Exception:
            user_id = "00000000-0000-0000-0000-000000000001"
    query = """
        SELECT
            first_name,
            due_date,
            last_period_date,
            dietary_restrictions,
            preferred_unit,
            daily_caffeine_limit
        FROM users
        WHERE id = %s
    """

    result = execute_query(query, (user_id,), fetch_one=True)

    if not result:
        return {
            "error": f"User not found: {user_id}",
            "first_name": None,
            "current_week": None,
            "due_date": None,
            "dietary_restrictions": [],
            "caffeine_limit": 200
        }

    due_date = result.get('due_date')
    current_week = calculate_pregnancy_week(str(due_date)) if due_date else None

    return {
        "first_name": result.get('first_name'),
        "current_week": current_week,
        "due_date": str(due_date) if due_date else None,
        "dietary_restrictions": result.get('dietary_restrictions', []),
        "preferred_unit": result.get('preferred_unit', 'metric'),
        "caffeine_limit": result.get('daily_caffeine_limit', 200)
    }


def get_current_week_meals_tool(user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get all foods consumed during the current week.

    This tool fetches:
    - Foods eaten each day
    - Meal types (breakfast, lunch, dinner, snacks)
    - Food names and colors
    - Rainbow color distribution

    Args:
        user_id: User ID (optional, will be retrieved from session context if not provided)

    Returns:
        Dictionary with current week's meals
    """
    # If no user_id provided, try to get from session context
    if user_id is None:
        try:
            from google.adk.sessions import get_current_session
            session = get_current_session()
            user_id = session.state.get("user_id", "00000000-0000-0000-0000-000000000001")
        except Exception:
            user_id = "00000000-0000-0000-0000-000000000001"
    # Get the start of the current week (Monday)
    today = datetime.now()
    start_of_week = today - timedelta(days=today.weekday())
    start_date = start_of_week.strftime('%Y-%m-%d')

    query = """
        SELECT
            m.log_date,
            m.day_of_week,
            m.meal_type,
            f.name as food_name,
            f.rainbow_color,
            f.warning_message
        FROM meals m
        JOIN meal_items mi ON m.id = mi.meal_id
        JOIN foods f ON mi.food_id = f.id
        WHERE m.user_id = %s
            AND m.log_date >= %s
        ORDER BY m.log_date,
            CASE m.meal_type
                WHEN 'breakfast' THEN 1
                WHEN 'lunch' THEN 2
                WHEN 'dinner' THEN 3
                WHEN 'snacks' THEN 4
            END
    """

    results = execute_query(query, (user_id, start_date), fetch_one=False)

    if not results:
        return {
            "message": "No meals found for current week",
            "start_date": start_date,
            "meals": [],
            "summary": {
                "total_foods": 0,
                "rainbow_colors": []
            }
        }

    # Organize meals by day and meal type
    meals_by_day = {}
    rainbow_colors = set()

    for row in results:
        date = str(row['log_date'])
        day = row['day_of_week']
        meal_type = row['meal_type']

        if date not in meals_by_day:
            meals_by_day[date] = {
                "date": date,
                "day_of_week": day,
                "meals": {}
            }

        if meal_type not in meals_by_day[date]["meals"]:
            meals_by_day[date]["meals"][meal_type] = []

        food_info = {
            "name": row['food_name'],
            "rainbow_color": row['rainbow_color'],
            "has_safety_warning": bool(row['warning_message'])
        }

        meals_by_day[date]["meals"][meal_type].append(food_info)

        if row['rainbow_color']:
            rainbow_colors.add(row['rainbow_color'])

    meals_list = list(meals_by_day.values())

    return {
        "start_date": start_date,
        "meals": meals_list,
        "summary": {
            "total_foods": len(results),
            "rainbow_colors": sorted(list(rainbow_colors)),
            "days_with_meals": len(meals_by_day)
        }
    }


def get_rainbow_summary_tool(user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get summary of rainbow colors consumed this week.

    This tool helps the agent understand which rainbow colors
    the user is eating and which they might be missing.

    Args:
        user_id: User ID (optional, will be retrieved from session context if not provided)

    Returns:
        Dictionary with rainbow color summary
    """
    # If no user_id provided, try to get from session context
    if user_id is None:
        try:
            from google.adk.sessions import get_current_session
            session = get_current_session()
            user_id = session.state.get("user_id", "00000000-0000-0000-0000-000000000001")
        except Exception:
            user_id = "00000000-0000-0000-0000-000000000001"
    # Get the start of the current week
    today = datetime.now()
    start_of_week = today - timedelta(days=today.weekday())
    start_date = start_of_week.strftime('%Y-%m-%d')

    query = """
        SELECT
            f.rainbow_color,
            COUNT(DISTINCT m.log_date) as days_consumed,
            COUNT(*) as times_consumed,
            STRING_AGG(DISTINCT f.name, ', ' ORDER BY f.name) as example_foods
        FROM meals m
        JOIN meal_items mi ON m.id = mi.meal_id
        JOIN foods f ON mi.food_id = f.id
        WHERE m.user_id = %s
            AND m.log_date >= %s
            AND f.rainbow_color IS NOT NULL
        GROUP BY f.rainbow_color
        ORDER BY f.rainbow_color
    """

    results = execute_query(query, (user_id, start_date), fetch_one=False)

    all_colors = ['Red', 'Orange/Yellow', 'Green', 'Blue/Purple', 'White/Brown']
    consumed_colors = {}

    for row in results:
        color = row['rainbow_color']
        consumed_colors[color] = {
            "days_consumed": row['days_consumed'],
            "times_consumed": row['times_consumed'],
            "example_foods": row['example_foods']
        }

    missing_colors = [c for c in all_colors if c not in consumed_colors]

    return {
        "start_date": start_date,
        "consumed_colors": consumed_colors,
        "missing_colors": missing_colors,
        "total_colors_consumed": len(consumed_colors),
        "colors_needed": 5 - len(consumed_colors)
    }


def log_sleep_tool(
    sleep_hours: float,
    sleep_quality: Optional[str] = None,
    sleep_notes: Optional[str] = None,
    user_id: Optional[str] = None,
    log_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Log sleep information for a specific day.

    Use this tool when the user mentions their sleep, such as:
    - "I slept 8 hours last night"
    - "I had a great night's sleep"
    - "I didn't sleep well, only 5 hours"

    Args:
        sleep_hours: Number of hours slept (e.g., 7.5, 8.0)
        sleep_quality: Quality rating - one of: 'poor', 'fair', 'good', 'excellent'
        sleep_notes: Optional notes about sleep (e.g., "Woke up 3 times", "Felt refreshed")
        user_id: User ID (optional, will be retrieved from session if not provided)
        log_date: Date to log for in YYYY-MM-DD format (optional, defaults to today)

    Returns:
        Dictionary with success status and logged information
    """
    # Get user_id from session if not provided
    if user_id is None:
        try:
            from google.adk.sessions import get_current_session
            session = get_current_session()
            user_id = session.state.get("user_id", "00000000-0000-0000-0000-000000000001")
        except Exception:
            user_id = "00000000-0000-0000-0000-000000000001"

    # Default to today if no date provided
    if log_date is None:
        log_date = datetime.now().strftime('%Y-%m-%d')

    # Validate sleep_quality
    valid_qualities = ['poor', 'fair', 'good', 'excellent']
    if sleep_quality and sleep_quality not in valid_qualities:
        return {
            "success": False,
            "error": f"Invalid sleep quality. Must be one of: {', '.join(valid_qualities)}"
        }

    # Check if log already exists for this date
    check_query = """
        SELECT id, symptoms, symptom_severity, symptom_notes
        FROM daily_logs
        WHERE user_id = %s AND log_date = %s
    """
    existing_log = execute_query(check_query, (user_id, log_date), fetch_one=True)

    if existing_log:
        # Update existing log
        update_query = """
            UPDATE daily_logs
            SET sleep_hours = %s,
                sleep_quality = %s,
                sleep_notes = %s,
                updated_at = NOW()
            WHERE user_id = %s AND log_date = %s
            RETURNING id
        """
        execute_query(
            update_query,
            (sleep_hours, sleep_quality, sleep_notes, user_id, log_date),
            fetch_one=True
        )
    else:
        # Insert new log
        insert_query = """
            INSERT INTO daily_logs (user_id, log_date, sleep_hours, sleep_quality, sleep_notes)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """
        execute_query(
            insert_query,
            (user_id, log_date, sleep_hours, sleep_quality, sleep_notes),
            fetch_one=True
        )

    return {
        "success": True,
        "message": f"Logged {sleep_hours} hours of sleep" + (f" ({sleep_quality})" if sleep_quality else ""),
        "sleep_hours": sleep_hours,
        "sleep_quality": sleep_quality,
        "log_date": log_date
    }


def log_symptoms_tool(
    symptoms: List[str],
    symptom_severity: Optional[str] = None,
    symptom_notes: Optional[str] = None,
    user_id: Optional[str] = None,
    log_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Log symptoms for a specific day.

    Use this tool when the user mentions symptoms they are experiencing, such as:
    - "I felt nauseous this morning"
    - "I have a headache and back pain"
    - "I'm experiencing fatigue"

    Common pregnancy symptoms include: nausea, vomiting, fatigue, headache,
    back_pain, leg_cramps, heartburn, constipation, swelling, mood_changes,
    insomnia, dizziness, breast_tenderness, frequent_urination, shortness_of_breath

    Args:
        symptoms: List of symptoms (e.g., ['nausea', 'fatigue', 'headache'])
        symptom_severity: Severity level - one of: 'mild', 'moderate', 'severe'
        symptom_notes: Optional detailed notes about symptoms
        user_id: User ID (optional, will be retrieved from session if not provided)
        log_date: Date to log for in YYYY-MM-DD format (optional, defaults to today)

    Returns:
        Dictionary with success status and logged information
    """
    # Get user_id from session if not provided
    if user_id is None:
        try:
            from google.adk.sessions import get_current_session
            session = get_current_session()
            user_id = session.state.get("user_id", "00000000-0000-0000-0000-000000000001")
        except Exception:
            user_id = "00000000-0000-0000-0000-000000000001"

    # Default to today if no date provided
    if log_date is None:
        log_date = datetime.now().strftime('%Y-%m-%d')

    # Validate symptom_severity
    valid_severities = ['mild', 'moderate', 'severe']
    if symptom_severity and symptom_severity not in valid_severities:
        return {
            "success": False,
            "error": f"Invalid symptom severity. Must be one of: {', '.join(valid_severities)}"
        }

    # Normalize symptom names (lowercase, replace spaces with underscores)
    normalized_symptoms = [s.lower().replace(' ', '_') for s in symptoms]

    # Check if log already exists for this date
    check_query = """
        SELECT id, sleep_hours, sleep_quality, sleep_notes
        FROM daily_logs
        WHERE user_id = %s AND log_date = %s
    """
    existing_log = execute_query(check_query, (user_id, log_date), fetch_one=True)

    if existing_log:
        # Update existing log
        update_query = """
            UPDATE daily_logs
            SET symptoms = %s,
                symptom_severity = %s,
                symptom_notes = %s,
                updated_at = NOW()
            WHERE user_id = %s AND log_date = %s
            RETURNING id
        """
        execute_query(
            update_query,
            (normalized_symptoms, symptom_severity, symptom_notes, user_id, log_date),
            fetch_one=True
        )
    else:
        # Insert new log
        insert_query = """
            INSERT INTO daily_logs (user_id, log_date, symptoms, symptom_severity, symptom_notes)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """
        execute_query(
            insert_query,
            (user_id, log_date, normalized_symptoms, symptom_severity, symptom_notes),
            fetch_one=True
        )

    return {
        "success": True,
        "message": f"Logged symptoms: {', '.join(normalized_symptoms)}" + (f" ({symptom_severity})" if symptom_severity else ""),
        "symptoms": normalized_symptoms,
        "symptom_severity": symptom_severity,
        "log_date": log_date
    }


def get_daily_log_tool(
    user_id: Optional[str] = None,
    log_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get the daily log (sleep and symptoms) for a specific day.

    Use this tool to check what the user has already logged for a day.

    Args:
        user_id: User ID (optional, will be retrieved from session if not provided)
        log_date: Date to get log for in YYYY-MM-DD format (optional, defaults to today)

    Returns:
        Dictionary with daily log information or message if no log exists
    """
    # Get user_id from session if not provided
    if user_id is None:
        try:
            from google.adk.sessions import get_current_session
            session = get_current_session()
            user_id = session.state.get("user_id", "00000000-0000-0000-0000-000000000001")
        except Exception:
            user_id = "00000000-0000-0000-0000-000000000001"

    # Default to today if no date provided
    if log_date is None:
        log_date = datetime.now().strftime('%Y-%m-%d')

    query = """
        SELECT
            log_date,
            sleep_hours,
            sleep_quality,
            sleep_notes,
            symptoms,
            symptom_severity,
            symptom_notes
        FROM daily_logs
        WHERE user_id = %s AND log_date = %s
    """

    result = execute_query(query, (user_id, log_date), fetch_one=True)

    if not result:
        return {
            "log_date": log_date,
            "has_log": False,
            "message": f"No log found for {log_date}"
        }

    return {
        "log_date": str(result['log_date']),
        "has_log": True,
        "sleep_hours": result.get('sleep_hours'),
        "sleep_quality": result.get('sleep_quality'),
        "sleep_notes": result.get('sleep_notes'),
        "symptoms": result.get('symptoms') or [],
        "symptom_severity": result.get('symptom_severity'),
        "symptom_notes": result.get('symptom_notes')
    }


# Tool definitions for Google ADK
def create_user_tools():
    """Create tool definitions for the agent"""
    from google.adk.tools.function_tool import FunctionTool

    tools = [
        FunctionTool(func=get_user_info_tool),
        FunctionTool(func=get_current_week_meals_tool),
        FunctionTool(func=get_rainbow_summary_tool),
        FunctionTool(func=log_sleep_tool),
        FunctionTool(func=log_symptoms_tool),
        FunctionTool(func=get_daily_log_tool)
    ]

    return tools
