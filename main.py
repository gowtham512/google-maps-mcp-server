from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from agent import run_agent_loop

# In-memory thread store. Replace with DB later.
THREADS: dict[str, list[dict[str, Any]]] = {}


class ChatRequest(BaseModel):
    thread_id: str = Field(default="default")
    message: str


class ChatResponse(BaseModel):
    thread_id: str
    reply: str
    tool_calls_used: list[str]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Nothing to initialize for in-memory store
    yield
    THREADS.clear()


app = FastAPI(title="Travel Planner Agent", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    history = THREADS.get(req.thread_id, [])
    result = await run_agent_loop(req.message, history)

    # Store updated history (exclude raw tool content from persistence to keep it small)
    THREADS[req.thread_id] = result["messages"]

    return ChatResponse(
        thread_id=req.thread_id,
        reply=result["reply"],
        tool_calls_used=result["tool_calls_used"],
    )


@app.get("/threads/{thread_id}")
async def get_thread(thread_id: str):
    return {"thread_id": thread_id, "messages": THREADS.get(thread_id, [])}


@app.post("/threads/{thread_id}/reset")
async def reset_thread(thread_id: str):
    THREADS.pop(thread_id, None)
    return {"thread_id": thread_id, "status": "reset"}


if __name__ == "__main__":
    import uvicorn
    from config import settings

    uvicorn.run("main:app", host="0.0.0.0", port=settings.port, reload=True)