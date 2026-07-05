from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agent import _execute_tool, run_agent_loop


@pytest.mark.asyncio
async def test_run_agent_loop_no_tools(monkeypatch):
    fake_response = MagicMock()
    fake_response.message = {
        "role": "assistant",
        "content": "Paris is beautiful in spring.",
    }

    monkeypatch.setattr("agent.ollama.chat", lambda **kwargs: fake_response)

    result = await run_agent_loop("Tell me about Paris")
    assert result["reply"] == "Paris is beautiful in spring."
    assert result["tool_calls_used"] == []
    assert len(result["messages"]) == 2
    assert result["messages"][0]["role"] == "user"
    assert result["messages"][1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_run_agent_loop_with_tool_call(monkeypatch):
    assistant_with_tool = {
        "role": "assistant",
        "content": "",
        "tool_calls": [
            {
                "function": {
                    "name": "search_places",
                    "arguments": {"text_query": "hotels in Paris", "region_code": "FR"},
                }
            }
        ],
    }
    assistant_final = {
        "role": "assistant",
        "content": "Here are some hotels in Paris.",
    }

    responses = [assistant_with_tool, assistant_final]
    monkeypatch.setattr(
        "agent.ollama.chat", lambda **kwargs: MagicMock(message=responses.pop(0))
    )

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
        return MagicMock(message={"role": "assistant", "content": "OK"})

    monkeypatch.setattr("agent.ollama.chat", capture_chat)

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