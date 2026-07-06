from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agent import (
    _execute_tool,
    extract_artifact_data,
    parse_openui_fallback,
    render_openui_fallback,
    run_agent_loop,
)


def _make_stream(content: str, tool_calls: list | None = None):
    """Create a fake streaming response iterable for the Ollama client."""
    chunk = MagicMock()
    chunk.message.content = content
    chunk.message.tool_calls = tool_calls
    return iter([chunk])


@pytest.mark.asyncio
async def test_run_agent_loop_no_tools(monkeypatch):
    monkeypatch.setattr(
        "agent._ollama_client.chat",
        lambda **kwargs: _make_stream("Paris is beautiful in spring."),
    )

    result = await run_agent_loop("Tell me about Paris")
    assert result["reply"] == "Paris is beautiful in spring."
    assert result["tool_calls_used"] == []
    assert len(result["messages"]) == 2
    assert result["messages"][0]["role"] == "user"
    assert result["messages"][1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_run_agent_loop_with_tool_call(monkeypatch):
    calls = [
        _make_stream(
            "",
            [{"function": {"name": "search_places", "arguments": {"text_query": "hotels in Paris", "region_code": "FR"}}}],
        ),
        _make_stream("Here are some hotels in Paris."),
    ]
    monkeypatch.setattr("agent._ollama_client.chat", lambda **kwargs: calls.pop(0))

    monkeypatch.setattr("agent.search_places", AsyncMock(return_value="1. Hotel X\n2. Hotel Y"))

    result = await run_agent_loop("Find hotels in Paris")
    assert result["reply"] == "Here are some hotels in Paris."
    assert "search_places" in result["tool_calls_used"]
    # user + assistant tool_call + tool result + final assistant
    assert len(result["messages"]) == 4


@pytest.mark.asyncio
async def test_run_agent_loop_history_window(monkeypatch):
    """Only recent 10 messages should be passed to Ollama."""
    captured_messages = []

    def capture_chat(**kwargs):
        captured_messages.append(list(kwargs["messages"]))
        return _make_stream("OK")

    monkeypatch.setattr("agent._ollama_client.chat", capture_chat)

    # Create 15 prior assistant messages
    long_history = [{"role": "assistant", "content": f"msg {i}"} for i in range(15)]
    result = await run_agent_loop("Latest question", long_history)

    # The context sent to Ollama should contain system + 9 recent + current user
    context = captured_messages[0]
    non_system = [m for m in context if m.get("role") != "system"]
    assert len(non_system) == 10  # 9 recent + current user
    assert non_system[0]["content"] == "msg 6"
    assert non_system[-1]["content"] == "Latest question"

    # Full history should keep all 17 messages (15 prior + current user + new reply)
    assert len(result["messages"]) == 17


@pytest.mark.asyncio
async def test_execute_tool_unknown():
    result = await _execute_tool("unknown_tool", {})
    assert "Unknown tool" in result


def test_extract_artifact_data_slides():
    reply = 'root = Stack([...])\n---ARTIFACT_DATA---\n{"type": "slides", "title": "Paris Deck", "slides": [{"title": "Intro", "bullets": ["Eiffel Tower"]}]}'
    data, artifact_type = extract_artifact_data(reply)
    assert artifact_type == "slides"
    assert "Paris Deck" in data


def test_extract_artifact_data_report():
    reply = 'root = Stack([...])\n---ARTIFACT_DATA---\n{"type": "report", "title": "Paris Report", "sections": [{"heading": "Summary", "body": "Great city"}]}'
    data, artifact_type = extract_artifact_data(reply)
    assert artifact_type == "report"
    assert "Paris Report" in data


def test_extract_artifact_data_null():
    reply = 'root = Stack([...])\n---ARTIFACT_DATA---\nnull'
    data, artifact_type = extract_artifact_data(reply)
    assert data is None
    assert artifact_type is None


def test_extract_artifact_data_missing_marker():
    data, artifact_type = extract_artifact_data("just some text")
    assert data is None
    assert artifact_type is None


def test_parse_openui_fallback_slides():
    code = 'root = Stack([tabs])\ntabs = Tabs([tab1, tab2])\ntab1 = TabItem("a", "Intro", [TextContent("Point 1", "default")])\ntab2 = TabItem("b", "Day 2", [TextContent("Point 2", "default")])'
    data, artifact_type = parse_openui_fallback(code)
    assert artifact_type == "slides"
    assert data["type"] == "slides"
    assert len(data["slides"]) > 0


def test_parse_openui_fallback_report():
    code = 'root = Stack([card])\ncard = Card([title, body])\ntitle = CardHeader("Report")\nbody = MarkDownRenderer("## Summary\n\nParis is nice.")'
    data, artifact_type = parse_openui_fallback(code)
    assert artifact_type == "report"
    assert data["type"] == "report"


@pytest.mark.asyncio
async def test_run_agent_loop_extracts_artifact_data(monkeypatch):
    artifact_json = '{"type": "slides", "title": "Paris Deck", "slides": []}'
    reply = f'root = Stack([card])\n---ARTIFACT_DATA---\n{artifact_json}'
    monkeypatch.setattr("agent._ollama_client.chat", lambda **kwargs: _make_stream(reply))

    result = await run_agent_loop("Make a slide deck about Paris")
    assert result["artifact_type"] == "slides"
    assert result["artifact_data"] == artifact_json
    assert result["messages"][-1].get("artifact_type") == "slides"