import os
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import _message_to_dict, app


@pytest.fixture(autouse=True)
def set_test_db():
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
    yield
    if "DATABASE_URL" in os.environ:
        del os.environ["DATABASE_URL"]


@pytest.fixture
async def client():
    from db import close_db, init_db

    await init_db(drop_all=True)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
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


@pytest.mark.asyncio
async def test_message_to_dict_includes_artifact_fields():
    from models import Message
    msg = Message(
        id=1,
        thread_id="t1",
        role="assistant",
        content="hello",
        artifact_type="slides",
        artifact_data='{"type": "slides"}',
    )
    data = _message_to_dict(msg)
    assert data["id"] == 1
    assert data["artifact_type"] == "slides"
    assert data["artifact_data"] == '{"type": "slides"}'


@pytest.mark.asyncio
async def test_export_message_artifact(client):
    resp = await client.post("/threads", json={"title": "Test"})
    thread_id = resp.json()["id"]

    with patch("main.run_agent_loop", return_value={
        "reply": "deck",
        "openui_code": "root = Stack([])",
        "artifact_type": "slides",
        "artifact_data": '{"type": "slides", "title": "Paris Deck", "slides": [{"title": "Intro", "bullets": ["Eiffel"]}]}',
        "tool_calls_used": [],
        "messages": [{"role": "assistant", "content": "deck", "artifact_type": "slides", "artifact_data": '{"type": "slides", "title": "Paris Deck", "slides": []}'}],
    }):
        await client.post(f"/threads/{thread_id}/chat", json={"message": "slides"})

    # find the assistant message id
    resp = await client.get(f"/threads/{thread_id}")
    messages = resp.json()["messages"]
    assistant_msg = next(m for m in messages if m["role"] == "assistant")

    # auto format for slides should return pptx
    resp = await client.get(f"/threads/{thread_id}/messages/{assistant_msg['id']}/artifact?format=auto")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/vnd.openxmlformats-officedocument.presentationml.presentation"

    # json
    resp = await client.get(f"/threads/{thread_id}/messages/{assistant_msg['id']}/artifact?format=json")
    assert resp.status_code == 200
    assert resp.json()["type"] == "slides"

    # explicit pdf for slides
    resp = await client.get(f"/threads/{thread_id}/messages/{assistant_msg['id']}/artifact?format=pdf")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"


@pytest.mark.asyncio
async def test_export_latest_artifact(client):
    resp = await client.post("/threads", json={"title": "Test"})
    thread_id = resp.json()["id"]

    with patch("main.run_agent_loop", return_value={
        "reply": "report",
        "openui_code": "root = Stack([])",
        "artifact_type": "report",
        "artifact_data": '{"type": "report", "title": "Paris Report", "sections": [{"heading": "Summary", "body": "Nice"}]}',
        "tool_calls_used": [],
        "messages": [{"role": "assistant", "content": "report", "artifact_type": "report", "artifact_data": '{"type": "report", "title": "Paris Report", "sections": []}'}],
    }):
        await client.post(f"/threads/{thread_id}/chat", json={"message": "report"})

    resp = await client.get(f"/threads/{thread_id}/artifact/latest?format=auto")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"


@pytest.mark.asyncio
async def test_export_artifact_no_data_returns_404(client):
    resp = await client.post("/threads", json={"title": "Test"})
    thread_id = resp.json()["id"]

    with patch("main.run_agent_loop", return_value={
        "reply": "hi",
        "tool_calls_used": [],
        "messages": [{"role": "assistant", "content": "hi"}],
    }):
        await client.post(f"/threads/{thread_id}/chat", json={"message": "hi"})

    resp = await client.get(f"/threads/{thread_id}/artifact/latest?format=auto")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_export_report_with_image(client):
    """Report export should succeed even when image_url is provided."""
    from unittest.mock import AsyncMock, patch

    resp = await client.post("/threads", json={"title": "Test"})
    thread_id = resp.json()["id"]

    # Create a minimal valid 1x1 PNG (white).
    png_bytes = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fedccc5e510000000049454e44ae426082"
    )

    with patch("artifacts._fetch_image", new=AsyncMock(return_value=png_bytes)):
        with patch("main.run_agent_loop", return_value={
            "reply": "report",
            "openui_code": "root = Stack([])",
            "artifact_type": "report",
            "artifact_data": '{"type": "report", "title": "Paris Report", "sections": [{"heading": "Eiffel", "image_url": "https://example.com/eiffel.png", "body": "Iconic tower"}]}',
            "tool_calls_used": [],
            "messages": [{"role": "assistant", "content": "report", "artifact_type": "report", "artifact_data": '{"type": "report", "title": "Paris Report", "sections": []}'}],
        }):
            await client.post(f"/threads/{thread_id}/chat", json={"message": "report with image"})

    resp = await client.get(f"/threads/{thread_id}/artifact/latest?format=pdf")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert len(resp.content) > 0


@pytest.mark.asyncio
async def test_export_artifact_bad_format_returns_400(client):
    resp = await client.post("/threads", json={"title": "Test"})
    thread_id = resp.json()["id"]

    with patch("main.run_agent_loop", return_value={
        "reply": "report",
        "artifact_type": "report",
        "artifact_data": '{"type": "report", "title": "Paris Report", "sections": []}',
        "tool_calls_used": [],
        "messages": [{"role": "assistant", "content": "report", "artifact_type": "report", "artifact_data": '{"type": "report", "title": "Paris Report", "sections": []}'}],
    }):
        await client.post(f"/threads/{thread_id}/chat", json={"message": "report"})

    resp = await client.get(f"/threads/{thread_id}/artifact/latest?format=docx")
    assert resp.status_code == 400