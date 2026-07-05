from unittest.mock import AsyncMock, MagicMock

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
    assert "hotels in Paris" in result["reply"] or "Hotel X" in result["reply"] or result["reply"] == "Here are some hotels in Paris."
    assert "search_places" in result["tool_calls_used"]


@pytest.mark.asyncio
async def test_execute_tool_unknown():
    result = await _execute_tool("unknown_tool", {})
    assert "Unknown tool" in result