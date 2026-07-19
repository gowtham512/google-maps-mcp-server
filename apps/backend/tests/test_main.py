import os
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.fixture(autouse=True)
def set_test_db():
    # Always use in-memory SQLite for unit tests so they never touch a real DB.
    original = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
    yield
    if original is None:
        os.environ.pop("DATABASE_URL", None)
    else:
        os.environ["DATABASE_URL"] = original


@pytest.fixture
async def client():
    from db import close_db, init_db, reset_engine

    reset_engine()
    await init_db(drop_all=True)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        # Register a user and attach the bearer token to all requests so
        # authenticated endpoints work in tests.
        resp = await c.post("/auth/register", json={"email": "test@example.com", "password": "pw123456"})
        token = resp.json()["access_token"]
        c.headers.update({"Authorization": f"Bearer {token}"})
        yield c
    await close_db()


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_create_and_list_threads(client):
    resp = await client.post("/threads", json={"title": "Rome Trip"})
    assert resp.status_code == 200
    data = resp.json()
    thread_id = data["id"]
    assert data["title"] == "Rome Trip"

    resp = await client.get("/threads")
    assert resp.status_code == 200
    threads = resp.json()
    assert any(t["id"] == thread_id for t in threads)


@pytest.mark.asyncio
async def test_chat_invokes_agent(client):
    resp = await client.post("/threads", json={"title": "Test"})
    thread_id = resp.json()["id"]

    with patch("main.run_agent_loop", return_value={
        "reply": "Here is a plan.",
        "tool_calls_used": ["search_places"],
        "messages": [{"role": "assistant", "content": "Here is a plan."}],
    }):
        resp = await client.post(f"/threads/{thread_id}/chat", json={"message": "Plan a trip"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["reply"] == "Here is a plan."
        assert data["tool_calls_used"] == ["search_places"]


@pytest.mark.asyncio
async def test_get_thread(client):
    resp = await client.post("/threads", json={"title": "Test"})
    thread_id = resp.json()["id"]

    with patch("main.run_agent_loop", return_value={
        "reply": "Plan.",
        "tool_calls_used": [],
        "messages": [{"role": "assistant", "content": "Plan."}],
    }):
        await client.post(f"/threads/{thread_id}/chat", json={"message": "Plan a trip"})

    resp = await client.get(f"/threads/{thread_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["thread"]["id"] == thread_id
    assert len(data["messages"]) >= 2  # user + assistant


@pytest.mark.asyncio
async def test_delete_thread(client):
    resp = await client.post("/threads", json={"title": "To Delete"})
    thread_id = resp.json()["id"]

    resp = await client.delete(f"/threads/{thread_id}")
    assert resp.status_code == 200

    resp = await client.get(f"/threads/{thread_id}")
    assert resp.status_code == 404
