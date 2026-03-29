import asyncio
import base64
import json
import os
import warnings
import logging
from pathlib import Path
from typing import AsyncIterable, Dict, Set
from datetime import datetime

from dotenv import load_dotenv
from fastapi import FastAPI, Query, WebSocket, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from google.adk.agents import LiveRequestQueue
from google.adk.agents.run_config import RunConfig
from google.adk.events.event import Event
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.genai import types
from midwaife.agent import root_agent
from meals.routes import router as meals_router
from users.routes import router as users_router
from midwaife.routes import router as agent_router
from daily_logs.routes import router as daily_logs_router

from fastapi.middleware.cors import CORSMiddleware

# Dynamic port configuration for Render
PORT = int(os.getenv('PORT', 8000))

#
# WebSocket Log Forwarding
#

# Store active WebSocket connections for log forwarding
websocket_connections: Dict[str, WebSocket] = {}

# Module-level variable to store the current WebSocket for log forwarding
_current_websocket: WebSocket = None



# Load Gemini API Key
load_dotenv()

APP_NAME = "ADK Streaming example"
session_service = InMemorySessionService()


async def start_agent_session(session_id, is_audio=False, websocket=None):
    """Starts an agent session"""

    # Create a Session
    session = await session_service.create_session(
        app_name=APP_NAME,
        user_id=session_id,
        session_id=session_id,
    )

    # Create a Runner
    runner = Runner(
        app_name=APP_NAME,
        agent=root_agent,
        session_service=session_service,
    )

    # Set response modality
    modality = "AUDIO" if is_audio else "TEXT"

    # Create speech config with voice settings
    speech_config = types.SpeechConfig(
        voice_config=types.VoiceConfig(
            # Puck, Charon, Kore, Fenrir, Aoede, Leda, Orus, and Zephyr
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Puck")
        )
    )

    # Create run config with basic settings
    config = {"response_modalities": [modality], "speech_config": speech_config}

    # Add output_audio_transcription when audio is enabled to get both audio and text
    if is_audio:
        config["output_audio_transcription"] = {}

    run_config = RunConfig(**config)

    # Create a LiveRequestQueue for this session
    live_request_queue = LiveRequestQueue()

    try:
        # Start agent session - don't await since it returns an async generator
        live_events = runner.run_live(
            session=session,
            live_request_queue=live_request_queue,
            run_config=run_config,
        )
        return live_events, live_request_queue
    except Exception as e:
        print(f"Error starting agent session: {e}")
        raise


async def agent_to_client_messaging(
    websocket: WebSocket, live_events: AsyncIterable[Event | None]
):
    """Agent to client communication"""
    try:
        async for event in live_events:
            if event is None:
                continue

            # If the turn complete or interrupted, send it
            if event.turn_complete or event.interrupted:
                message = {
                    "turn_complete": event.turn_complete,
                    "interrupted": event.interrupted,
                }
                await websocket.send_text(json.dumps(message))
                #print(f"[AGENT TO CLIENT]: {message}")
                continue

            # Read the Content and its first Part
            part = event.content and event.content.parts and event.content.parts[0]
            if not part:
                continue

            # Make sure we have a valid Part
            if not isinstance(part, types.Part):
                continue

            # Only send text if it's a partial response (streaming)
            # Skip the final complete message to avoid duplication
            if part.text and event.partial:
                text_content = part.text.strip()
                
                # Only skip obvious system warnings, not agent responses
                if text_content and len(text_content) > 3:
                    message = {
                        "mime_type": "text/plain",
                        "data": text_content,
                        "role": "model",
                    }
                    await websocket.send_text(json.dumps(message))
                    #print(f"[AGENT TO CLIENT]: text/plain: {text_content}")

            # If it's audio, send Base64 encoded audio data
            is_audio = (
                part.inline_data
                and part.inline_data.mime_type
                and part.inline_data.mime_type.startswith("audio/pcm")
            )
            if is_audio:
                audio_data = part.inline_data and part.inline_data.data
                if audio_data:
                    message = {
                        "mime_type": "audio/pcm",
                        "data": base64.b64encode(audio_data).decode("ascii"),
                        "role": "model",
                    }
                    await websocket.send_text(json.dumps(message))
                    #print(f"[AGENT TO CLIENT]: audio/pcm: {len(audio_data)} bytes.")
    except Exception as e:
        print(f"Error in agent_to_client_messaging: {e}")
        # Send error message to client instead of raising
        try:
            error_message = {
                "mime_type": "text/plain",
                "data": f"I apologize, but there was an error processing your request. Please try again.",
                "role": "model",
                "turn_complete": True,
                "error": True
            }
            await websocket.send_text(json.dumps(error_message))
        except Exception as send_error:
            print(f"Error sending error message to client: {send_error}")
        raise


async def client_to_agent_messaging(
    websocket: WebSocket, live_request_queue: LiveRequestQueue
):
    """Client to agent communication"""
    while True:
        # Decode JSON message
        message_json = await websocket.receive_text()
        message = json.loads(message_json)
        mime_type = message["mime_type"]
        data = message["data"]
        role = message.get("role", "user")  # Default to 'user' if role is not provided

        # Send the message to the agent
        if mime_type == "text/plain":
            # Send a text message
            content = types.Content(role=role, parts=[types.Part.from_text(text=data)])
            live_request_queue.send_content(content=content)
            print(f"[FRONTEND TO AGENT]: {data}")
        elif mime_type == "audio/pcm":
            # Send audio data
            decoded_data = base64.b64decode(data)

            # Send the audio data - note that ActivityStart/End and transcription
            # handling is done automatically by the ADK when input_audio_transcription
            # is enabled in the config
            live_request_queue.send_realtime(
                types.Blob(data=decoded_data, mime_type=mime_type)
            )
            print(f"[FRONTEND TO AGENT]: audio/pcm: {len(decoded_data)} bytes")
        elif mime_type.startswith("image/"):
            # Send image data as binary
            decoded_data = base64.b64decode(data)
            
            # Send the image data as a blob
            live_request_queue.send_realtime(
                types.Blob(data=decoded_data, mime_type=mime_type)
            )
            print(f"[FRONTEND TO AGENT]: {mime_type}: {len(decoded_data)} bytes")
        else:
            raise ValueError(f"Mime type not supported: {mime_type}")


#
# FastAPI web app
#

app = FastAPI()

# Include routers
app.include_router(meals_router)
app.include_router(users_router)
app.include_router(agent_router)
app.include_router(daily_logs_router)
# Allow CORS for frontend dev server and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        os.getenv("FRONTEND_URL", ""),  # Production frontend URL from environment variable
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get the absolute path to the app directory
APP_DIR = Path(__file__).parent
FRONT_END_DIR = Path(__file__).parent.parent / "frontend"
# STATIC_DIR = APP_DIR / "static"   # Removed
UPLOAD_DIR = APP_DIR / "uploads"
PUBLIC_DIR = FRONT_END_DIR / "public"

# Create uploads directory if it doesn't exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# --- Add a simple health check root route ---
@app.get("/")
async def root():
    return {"status": "ok"}

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    is_audio: str = Query(...),
):
    """Client websocket endpoint"""
    print(f"New WebSocket connection request for session {session_id}")
    
    # Wait for client connection
    await websocket.accept()
    websocket_connections[session_id] = websocket
    
    print(f"Client #{session_id} connected, audio mode: {is_audio}")
    print(f"Active WebSocket connections: {list(websocket_connections.keys())}")

    try:
        # Start agent session
        live_events, live_request_queue = await start_agent_session(
            session_id, is_audio == "true", websocket
        )

        # Store live_request_queue with the WebSocket connection
        websocket.live_request_queue = live_request_queue

        # Start tasks
        agent_to_client_task = asyncio.create_task(
            agent_to_client_messaging(websocket, live_events)
        )
        client_to_agent_task = asyncio.create_task(
            client_to_agent_messaging(websocket, live_request_queue)
        )
        
        # Wait for both tasks to complete
        await asyncio.gather(agent_to_client_task, client_to_agent_task)
    except Exception as e:
        print(f"WebSocket error for session {session_id}: {e}")
        # Send a user-friendly error message before closing the connection
        try:
            error_message = {
                "mime_type": "text/plain",
                "data": f"I apologize, but there was an unexpected error. Please try again.",
                "role": "model",
                "turn_complete": True,
                "error": True
            }
            await websocket.send_text(json.dumps(error_message))
        except Exception as send_error:
            print(f"Error sending error message to client: {send_error}")
        raise  # Re-raise the exception to ensure proper error handling
    finally:
        # Remove the connection when it's closed
        if session_id in websocket_connections:
            del websocket_connections[session_id]
            print(f"WebSocket connection removed for session {session_id}")
            print(f"Remaining WebSocket connections: {list(websocket_connections.keys())}")
        
            
        print(f"Client #{session_id} disconnected")

@app.get("/favicon.ico")
async def favicon():
    return FileResponse(PUBLIC_DIR / "favicon.ico")