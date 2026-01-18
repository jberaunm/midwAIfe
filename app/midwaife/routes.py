"""
Midwaife Agent API Routes

REST API endpoints for interacting with the midwaife agent.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from midwaife.agent import root_agent
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.genai import types
from chat.services import (
    save_message,
    get_recent_messages,
    get_or_create_daily_greeting
)

router = APIRouter(prefix="/api/agent", tags=["agent"])

# Session service for agent
session_service = InMemorySessionService()

# App configuration
APP_NAME = "MidwAIfe"

# Runner for the agent
runner = Runner(
    agent=root_agent,
    app_name=APP_NAME,
    session_service=session_service
)

# Session initialization flag
_session_initialized = False

async def ensure_session_initialized():
    """Ensure default session is initialized"""
    global _session_initialized
    if not _session_initialized:
        try:
            session = await session_service.create_session(
                app_name=APP_NAME,
                user_id="default_user",
                session_id="default_session"
            )
            _session_initialized = True
            print(f"[OK] Initialized default session for agent")
            print(f"  App: {APP_NAME}, User: default_user, Session: default_session")
            return session
        except Exception as e:
            print(f"Session initialization error: {e}")
            # Session might already exist, which is fine
            _session_initialized = True


async def call_agent_async(query: str, user_id: str, session_id: str) -> str:
    """
    Sends a query to the agent and returns the final response.

    Args:
        query: The user's message/question
        user_id: User identifier
        session_id: Session identifier for conversation context

    Returns:
        The agent's text response
    """
    print(f"\n{'='*80}")
    print(f">>> User Query: {query}")
    print(f"User ID: {user_id}, Session ID: {session_id}")
    print(f"{'='*80}\n")

    # Verify session exists before running
    try:
        existing_session = await session_service.get_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id
        )
        print(f"[OK] Session verified: {session_id}")
        print(f"  Session app_name: {existing_session.app_name if hasattr(existing_session, 'app_name') else 'N/A'}")
        print(f"  Session user_id: {existing_session.user_id if hasattr(existing_session, 'user_id') else 'N/A'}")
        print(f"  Session id: {existing_session.session_id if hasattr(existing_session, 'session_id') else 'N/A'}")
    except Exception as e:
        print(f"[ERROR] Session verification failed: {e}")
        raise ValueError(f"Session {session_id} not properly initialized")

    # Prepare the user's message in ADK format
    content = types.Content(role='user', parts=[types.Part(text=query)])

    final_response_text = "I apologize, but I couldn't generate a response. Please try again."

    # Execute the agent and process events
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=content
    ):
        print(f"  [Event] Author: {event.author}, Type: {type(event).__name__}, Final: {event.is_final_response()}")

        # Check if this is the final response
        if event.is_final_response():
            if event.content and event.content.parts:
                # Extract text from the first part
                final_response_text = event.content.parts[0].text
            elif event.actions and event.actions.escalate:
                # Handle escalations/errors
                final_response_text = f"I encountered an issue: {event.error_message or 'Unknown error'}"
            break

    print(f"\n{'='*80}")
    print(f"<<< Agent Response: {final_response_text}")
    print(f"{'='*80}\n")

    return final_response_text


class ChatRequest(BaseModel):
    """Request to chat with the midwaife agent"""
    message: str = Field(..., description="Your question or message")
    user_id: Optional[str] = Field(None, description="User ID for tracking")
    session_id: Optional[str] = Field(None, description="Session ID for conversation context")


class ChatResponse(BaseModel):
    """Response from the midwaife agent"""
    success: bool = Field(..., description="Whether the request was successful")
    response: str = Field(..., description="Agent's response")
    user_id: str = Field(..., description="User ID")
    session_id: str = Field(..., description="Session ID")
    error: Optional[str] = Field(None, description="Error message if unsuccessful")


@router.post("/chat", response_model=ChatResponse)
async def chat_with_agent(request: ChatRequest) -> ChatResponse:
    """
    Chat with the midwaife AI companion.

    The agent provides support and information for pregnant women,
    including nutrition advice, meal planning, and general pregnancy support.

    Example queries:
    - "What foods should I eat in my first trimester?"
    - "Can I have coffee during pregnancy?"
    - "What are good sources of iron?"
    - "Help me plan meals for this week"
    """
    try:
        # Ensure session is initialized
        await ensure_session_initialized()

        # Use default user for now (or from request)
        user_id = request.user_id or "00000000-0000-0000-0000-000000000001"
        session_id = "default_session"

        print(f"Using user: {user_id}, session: {session_id}")
        print(f"Query: {request.message[:50]}...")

        # Save user message to database
        save_message(
            user_id=user_id,
            session_id=session_id,
            role='user',
            content=request.message
        )

        # Call the agent
        response_text = await call_agent_async(
            query=request.message,
            user_id="default_user",  # ADK session still uses default_user
            session_id=session_id
        )

        # Save agent response to database
        save_message(
            user_id=user_id,
            session_id=session_id,
            role='model',
            content=response_text
        )

        return ChatResponse(
            success=True,
            response=response_text,
            user_id=user_id,
            session_id=session_id
        )

    except Exception as e:
        print(f"\n{'='*80}")
        print(f"ERROR: {str(e)}")
        print(f"{'='*80}\n")

        import traceback
        traceback.print_exc()

        return ChatResponse(
            success=False,
            response="",
            user_id=request.user_id or "unknown",
            session_id=request.session_id or "unknown",
            error=str(e)
        )


class MessageHistoryResponse(BaseModel):
    """Response containing message history"""
    messages: List[Dict[str, Any]] = Field(..., description="List of messages")
    count: int = Field(..., description="Number of messages returned")


@router.get("/messages/{user_id}", response_model=MessageHistoryResponse)
async def get_message_history(
    user_id: str,
    limit: int = 50,
    since_date: Optional[str] = None
):
    """
    Get recent message history for a user.

    Args:
        user_id: User ID
        limit: Maximum number of messages (default: 50)
        since_date: Optional date filter (YYYY-MM-DD)

    Returns:
        List of messages in chronological order
    """
    try:
        messages = get_recent_messages(user_id, limit=limit, since_date=since_date)
        return MessageHistoryResponse(
            messages=messages,
            count=len(messages)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class GreetingResponse(BaseModel):
    """Daily greeting response"""
    greeting: str = Field(..., description="Greeting message")
    is_new: bool = Field(..., description="Whether this is a newly generated greeting")
    message_id: str = Field(..., description="Message ID")


@router.get("/greeting/{user_id}", response_model=GreetingResponse)
async def get_daily_greeting(user_id: str):
    """
    Get or generate daily greeting for a user.

    If a greeting has already been sent today, returns the existing greeting.
    Otherwise, generates a new personalized greeting based on:
    - Time of day
    - Current pregnancy week
    - Recent nutrition (rainbow colors)

    Args:
        user_id: User ID

    Returns:
        Greeting message
    """
    try:
        # Check if greeting already exists
        from chat.services import get_today_greeting

        existing_greeting = get_today_greeting(user_id)

        if existing_greeting:
            return GreetingResponse(
                greeting=existing_greeting['content'],
                is_new=False,
                message_id=existing_greeting['id']
            )

        # Generate new greeting
        greeting_message = get_or_create_daily_greeting(
            user_id=user_id,
            session_id="default_session"
        )

        return GreetingResponse(
            greeting=greeting_message['content'],
            is_new=True,
            message_id=greeting_message['id']
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def agent_health():
    """Check agent health and configuration"""
    return {
        "status": "healthy",
        "agent_name": root_agent.name,
        "agent_description": root_agent.description,
        "tools_count": len(root_agent.tools) if hasattr(root_agent, 'tools') else 0
    }
