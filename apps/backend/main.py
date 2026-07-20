import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from agent import run_agent_loop, run_agent_loop_stream
from auth import create_access_token, get_current_user_id, hash_password, verify_password
from config import settings
from db import close_db, get_session, init_db, migrate_db
from models import Message, Thread, User


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)


class ChatResponse(BaseModel):
    thread_id: str
    reply: str
    tool_calls_used: list[str]


class CreateThreadRequest(BaseModel):
    title: str = Field(default="New Chat", min_length=1, max_length=200)


class ThreadResponse(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime


class MessageOut(BaseModel):
    id: int
    role: str
    content: str | None = None
    tool_calls: list[dict[str, Any]] | None = None
    created_at: datetime


class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    email: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await migrate_db()
    yield
    await close_db()


app = FastAPI(title="Travel Planner Chat Agent", lifespan=lifespan)

logger = logging.getLogger("travel_agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _json_safe(obj: Any) -> Any:
    """Recursively convert objects into JSON-serializable primitives.

    Handles datetimes, Pydantic models, dataclasses, dicts, lists, and
    falls back to ``str()`` for anything else so SSE never crashes on an
    unexpected SDK object.
    """
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, BaseModel):
        return _json_safe(obj.model_dump() if hasattr(obj, "model_dump") else obj.dict())
    if hasattr(obj, "__dataclass_fields__"):
        from dataclasses import asdict

        return _json_safe(asdict(obj))
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    if isinstance(obj, (str, int, float, bool, type(None))):
        return obj
    # Last resort: coerce unknown objects to their string representation instead
    # of letting json.dumps raise TypeError mid-stream.
    return str(obj)


def _message_to_dict(msg: Message) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": msg.id,
        "role": msg.role,
        "content": msg.content or "",
        "created_at": msg.created_at.isoformat(),
    }
    if msg.tool_calls:
        data["tool_calls"] = json.loads(msg.tool_calls)
    return data


async def _persist_turn(thread_id: str, user_message: str, history: list[dict[str, Any]], messages: list[dict[str, Any]]):
    """Persist exactly two rows per turn: the user message and the final assistant message."""
    async with get_session() as session:
        thread_result = await session.exec(select(Thread).where(Thread.id == thread_id))
        thread = thread_result.scalar_one_or_none()
        if thread:
            thread.updated_at = datetime.now(timezone.utc)

        # Row 1: user message
        session.add(
            Message(
                thread_id=thread_id,
                role="user",
                content=user_message,
                created_at=datetime.now(timezone.utc),
            )
        )

        # Row 2: final assistant message (last assistant entry in the new messages)
        new_messages = messages[len(history):]
        final_assistant = next(
            (m for m in reversed(new_messages) if m.get("role") == "assistant"),
            None,
        )
        if final_assistant:
            tool_calls = final_assistant.get("tool_calls")
            session.add(
                Message(
                    thread_id=thread_id,
                    role="assistant",
                    content=final_assistant.get("content"),
                    tool_calls=json.dumps(tool_calls) if tool_calls else None,
                    created_at=datetime.now(timezone.utc),
                )
            )


@app.get("/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------


@app.post("/auth/register", response_model=AuthResponse, status_code=201)
async def register(req: RegisterRequest):
    """Create a new user account and return an access token."""
    async with get_session() as session:
        existing = await session.exec(select(User).where(User.email == req.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already registered")
        user = User(email=req.email, hashed_password=hash_password(req.password))
        session.add(user)
        await session.flush()
        await session.refresh(user)
        token = create_access_token(user.id, user.email)
        return AuthResponse(access_token=token, user_id=user.id, email=user.email)


@app.post("/auth/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    """Authenticate an existing user and return an access token."""
    async with get_session() as session:
        result = await session.exec(select(User).where(User.email == req.email))
        user = result.scalar_one_or_none()
        if not user or not verify_password(req.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        token = create_access_token(user.id, user.email)
        return AuthResponse(access_token=token, user_id=user.id, email=user.email)


@app.post("/threads", response_model=ThreadResponse)
async def create_thread(req: CreateThreadRequest, user_id: int = Depends(get_current_user_id)):
    thread_id = str(uuid.uuid4())
    thread = Thread(
        id=thread_id,
        title=req.title,
        user_id=user_id,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    async with get_session() as session:
        session.add(thread)
        await session.flush()
        await session.refresh(thread)
        return ThreadResponse(
            id=thread.id,
            title=thread.title,
            created_at=thread.created_at,
            updated_at=thread.updated_at,
        )


@app.get("/threads", response_model=list[ThreadResponse])
async def list_threads(user_id: int = Depends(get_current_user_id)):
    async with get_session() as session:
        result = await session.exec(
            select(Thread)
            .where(Thread.user_id == user_id)
            .order_by(Thread.updated_at.desc())
        )
        threads = result.scalars().all()
        return [
            ThreadResponse(id=t.id, title=t.title, created_at=t.created_at, updated_at=t.updated_at)
            for t in threads
        ]


@app.get("/threads/{thread_id}")
async def get_thread(thread_id: str, user_id: int = Depends(get_current_user_id)):
    async with get_session() as session:
        result = await session.exec(
            select(Thread)
            .where(Thread.id == thread_id)
            .where(Thread.user_id == user_id)
            .options(selectinload(Thread.messages))  # type: ignore[arg-type]
        )
        thread = result.scalar_one_or_none()
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")
        messages = [_message_to_dict(m) for m in thread.messages]
        thread_data = ThreadResponse(
            id=thread.id, title=thread.title, created_at=thread.created_at, updated_at=thread.updated_at
        )
    return {"thread": thread_data, "messages": messages}


@app.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, user_id: int = Depends(get_current_user_id)):
    async with get_session() as session:
        result = await session.exec(
            select(Thread).where(Thread.id == thread_id).where(Thread.user_id == user_id)
        )
        thread = result.scalar_one_or_none()
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")
        await session.delete(thread)
    return {"thread_id": thread_id, "status": "deleted"}


class UpdateThreadRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


@app.patch("/threads/{thread_id}", response_model=ThreadResponse)
async def update_thread(thread_id: str, req: UpdateThreadRequest, user_id: int = Depends(get_current_user_id)):
    """Update thread title."""
    async with get_session() as session:
        result = await session.exec(
            select(Thread).where(Thread.id == thread_id).where(Thread.user_id == user_id)
        )
        thread = result.scalar_one_or_none()
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")
        thread.title = req.title
        thread.updated_at = datetime.now(timezone.utc)
        await session.flush()
        await session.refresh(thread)
        return ThreadResponse(
            id=thread.id,
            title=thread.title,
            created_at=thread.created_at,
            updated_at=thread.updated_at,
        )


@app.post("/threads/{thread_id}/chat", response_model=ChatResponse)
async def chat(thread_id: str, req: ChatRequest, accept: str = Header(default=""), user_id: int = Depends(get_current_user_id)):
    async with get_session() as session:
        result = await session.exec(
            select(Thread).where(Thread.id == thread_id).where(Thread.user_id == user_id)
        )
        thread = result.scalar_one_or_none()
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")

        # Load existing messages in chronological order
        msg_result = await session.exec(
            select(Message).where(Message.thread_id == thread_id).order_by(Message.created_at.asc())
        )
        history = [m.to_dict() for m in msg_result.scalars().all()]

    if "text/event-stream" in accept:
        async def sse_stream():
            final_event: dict[str, Any] | None = None
            persisted = False
            try:
                async for event in run_agent_loop_stream(req.message, history):
                    if event["type"] == "done":
                        final_event = event
                    yield f"event: {event['type']}\ndata: {json.dumps(_json_safe(event))}\n\n"
            finally:
                # Persist even if the client disconnects after the turn completed.
                if final_event and not persisted:
                    persisted = True
                    try:
                        await _persist_turn(thread_id, req.message, history, final_event["messages"])
                    except Exception:
                        logger.exception("Failed to persist turn for thread %s", thread_id)

        return StreamingResponse(
            sse_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # disable nginx buffering for SSE
            },
        )

    # Non-streaming fallback
    result = await run_agent_loop(req.message, history)
    try:
        await _persist_turn(thread_id, req.message, history, result["messages"])
    except Exception:
        logger.exception("Failed to persist turn for thread %s", thread_id)

    return ChatResponse(
        thread_id=thread_id,
        reply=result["reply"],
        tool_calls_used=result["tool_calls_used"],
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=settings.port, reload=True)