import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from agent import run_agent_loop
from config import settings
from db import close_db, get_session, init_db
from models import Message, Thread


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    thread_id: str
    reply: str
    tool_calls_used: list[str]


class CreateThreadRequest(BaseModel):
    title: str = "New Chat"


class ThreadResponse(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime


class MessageOut(BaseModel):
    role: str
    content: str | None = None
    tool_name: str | None = None
    tool_calls: list[dict[str, Any]] | None = None
    created_at: datetime


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await close_db()


app = FastAPI(title="Travel Planner Chat Agent", lifespan=lifespan)


def _message_to_dict(msg: Message) -> dict[str, Any]:
    data: dict[str, Any] = {
        "role": msg.role,
        "content": msg.content or "",
        "created_at": msg.created_at,
    }
    if msg.tool_name:
        data["tool_name"] = msg.tool_name
    if msg.tool_calls:
        data["tool_calls"] = json.loads(msg.tool_calls)
    return data


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/threads", response_model=ThreadResponse)
async def create_thread(req: CreateThreadRequest):
    thread_id = str(uuid.uuid4())
    thread = Thread(
        id=thread_id,
        title=req.title,
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
async def list_threads():
    async with get_session() as session:
        result = await session.exec(select(Thread).order_by(Thread.updated_at.desc()))
        threads = result.scalars().all()
        return [
            ThreadResponse(id=t.id, title=t.title, created_at=t.created_at, updated_at=t.updated_at)
            for t in threads
        ]


@app.get("/threads/{thread_id}")
async def get_thread(thread_id: str):
    async with get_session() as session:
        result = await session.exec(
            select(Thread)
            .where(Thread.id == thread_id)
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
async def delete_thread(thread_id: str):
    async with get_session() as session:
        result = await session.exec(select(Thread).where(Thread.id == thread_id))
        thread = result.scalar_one_or_none()
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")
        await session.delete(thread)
    return {"thread_id": thread_id, "status": "deleted"}


@app.post("/threads/{thread_id}/chat", response_model=ChatResponse)
async def chat(thread_id: str, req: ChatRequest):
    async with get_session() as session:
        result = await session.exec(select(Thread).where(Thread.id == thread_id))
        thread = result.scalar_one_or_none()
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")

        # Load existing messages in chronological order
        msg_result = await session.exec(
            select(Message).where(Message.thread_id == thread_id).order_by(Message.created_at.asc())
        )
        history = [m.to_dict() for m in msg_result.scalars().all()]

    # Run agent loop with 10-message window handled inside
    result = await run_agent_loop(req.message, history)

    # Persist user message and agent responses
    async with get_session() as session:
        # Reload thread in this session so we can update its timestamp
        thread_result = await session.exec(select(Thread).where(Thread.id == thread_id))
        thread = thread_result.scalar_one_or_none()
        if thread:
            thread.updated_at = datetime.now(timezone.utc)

        # User message
        session.add(
            Message(
                thread_id=thread_id,
                role="user",
                content=req.message,
                created_at=datetime.now(timezone.utc),
            )
        )

        # New assistant/tool messages returned from the loop
        for msg in result["messages"][len(history) :]:
            if msg.get("role") == "user":
                continue  # already persisted above
            db_msg = Message(
                thread_id=thread_id,
                role=msg.get("role", "assistant"),
                content=msg.get("content"),
                tool_name=msg.get("tool_name"),
                tool_calls=json.dumps(msg.get("tool_calls")) if msg.get("tool_calls") else None,
                created_at=datetime.now(timezone.utc),
            )
            session.add(db_msg)

    return ChatResponse(
        thread_id=thread_id,
        reply=result["reply"],
        tool_calls_used=result["tool_calls_used"],
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=settings.port, reload=True)