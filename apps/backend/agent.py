from pathlib import Path
from typing import Any

import ollama

from config import settings
from maps_tools import compute_route, find_nearby_places, geocode_address, search_places


AVAILABLE_TOOLS = [search_places, geocode_address, compute_route, find_nearby_places]

# Ollama client configured with the host from settings.
_ollama_client = ollama.Client(host=settings.ollama_base_url)

OPENUI_SYSTEM_PROMPT = (
    Path(__file__).with_name("openui_system_prompt.txt").read_text(encoding="utf-8")
)

SYSTEM_PROMPT = f"""\
{OPENUI_SYSTEM_PROMPT}

You are also a helpful travel planning assistant. You have access to Google Maps tools to help users plan trips.

Available tools:
1. search_places - Search for places, businesses, addresses, or points of interest.
2. geocode_address - Convert an address to coordinates and place ID.
3. compute_route - Compute driving or walking routes between two addresses.
4. find_nearby_places - Find places of a specific type near an address (e.g., hotels, restaurants, gas stations).

You can make multiple tool calls in a loop until you have enough information to answer the user's request.
When you have a final answer, output it as valid openui-lang code using Cards, TextContent, Tables, Lists, etc.
If you cannot produce valid openui-lang, output a plain text explanation and the system will wrap it for you.
"""


def _sanitize_for_ollama(msg: dict[str, Any]) -> dict[str, Any]:
    """Remove fields Ollama does not expect from a message before sending it back."""
    allowed = {"role", "content", "tool_calls", "tool_name", "images"}
    return {k: v for k, v in msg.items() if k in allowed}


def _escape_openui(text: str) -> str:
    """Escape characters that break OpenUI Lang rendering."""
    return (
        text.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def render_openui_fallback(reply: str, tool_calls_used: list[str]) -> str:
    """Convert plain text into a minimal openui-lang program for safe rendering."""
    reply_safe = _escape_openui(reply)
    tool_lines = ""
    tool_children = ""
    if tool_calls_used:
        tool_items = "\n".join(
            f'  tool_{i} = TextContent("  • {name}", "small")'
            for i, name in enumerate(tool_calls_used)
        )
        tool_refs = ", ".join(f"tool_{i}" for i in range(len(tool_calls_used)))
        tool_lines = f"""\
tools_header = TextContent("Tools used:", "small")
{tool_items}
tools_stack = Stack([tools_header, {tool_refs}], "column", "xs")
"""
        tool_children = ", tools_stack"
    code = f"""\
root = Stack([card], "column", "m")
card = Card([title, body{tool_children}])
title = CardHeader("Travel Plan")
body = TextContent("{reply_safe}", "default")
{tool_lines}""".strip()
    return code


def looks_like_openui(code: str) -> bool:
    """Heuristic check for valid openui-lang shape."""
    return bool(code.strip()) and "root = Stack(" in code


def _build_message_from_response(message: Any) -> dict[str, Any]:
    """Build a plain dict from an Ollama SDK response.message object or dict."""
    if isinstance(message, dict):
        return {
            "role": message.get("role", "assistant"),
            "content": message.get("content", "") or "",
            "tool_calls": message.get("tool_calls"),
        }
    return {
        "role": getattr(message, "role", "assistant"),
        "content": getattr(message, "content", "") or "",
        "tool_calls": getattr(message, "tool_calls", None),
    }


async def run_agent_loop(user_message: str, message_history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """
    Run the Ollama tool-calling agent loop for a single user turn.

    Only the most recent 10 messages plus the current user message are sent to the model
    to keep context focused and reduce token usage.

    Returns:
        dict with:
            - reply: final assistant text
            - tool_calls_used: list of tool names invoked
            - messages: full updated message history (including this turn)
    """
    full_history: list[dict[str, Any]] = list(message_history) if message_history else []

    # Build the context window: system prompt + last 9 history turns + current user message = 10 messages
    context: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    recent_history = full_history[-9:] if len(full_history) > 9 else full_history
    context.extend(_sanitize_for_ollama(m) for m in recent_history)
    context.append({"role": "user", "content": user_message})

    tool_calls_used: list[str] = []
    max_iterations = 5

    for _ in range(max_iterations):
        response = _ollama_client.chat(
            model=settings.ollama_model,
            messages=context,
            tools=AVAILABLE_TOOLS,
            options={"temperature": 0.2},
            think=True,
        )

        assistant_message = _build_message_from_response(response.message)
        context.append(assistant_message)

        tool_calls = assistant_message.get("tool_calls") or []
        if not tool_calls:
            break

        for call in tool_calls:
            if isinstance(call, dict):
                fn = call.get("function", {})
                tool_name = fn.get("name", "")
                arguments = fn.get("arguments", {}) or {}
            else:
                tool_name = call.function.name
                arguments = call.function.arguments or {}
            tool_calls_used.append(tool_name)

            tool_result = await _execute_tool(tool_name, arguments)
            context.append(
                {
                    "role": "tool",
                    "tool_name": tool_name,
                    "content": str(tool_result),
                }
            )
    else:
        # Hit max iterations without a final answer
        context.append(
            {
                "role": "assistant",
                "content": "I made several tool calls but couldn't finalize a response. Please try rephrasing your request.",
            }
        )

    # Collect only the new assistant/tool/turn messages to add to full history
    # The new turn starts after the recent_history slice + the user message
    new_messages = context[len(recent_history) + 1 :]  # skip system + recent_history + current user

    full_history.extend(new_messages)

    final_message = new_messages[-1] if new_messages else {"role": "assistant", "content": ""}
    reply = final_message.get("content", "")

    # Treat the final reply as openui-lang if it looks like it; otherwise wrap it.
    openui_code = reply if looks_like_openui(reply) else render_openui_fallback(reply, tool_calls_used)
    final_message["openui_code"] = openui_code

    return {
        "reply": reply,
        "openui_code": openui_code,
        "tool_calls_used": list(dict.fromkeys(tool_calls_used)),
        "messages": full_history,
    }


async def _execute_tool(tool_name: str, arguments: dict[str, Any]) -> str:
    if tool_name == "search_places":
        return await search_places(
            text_query=arguments.get("text_query", ""),
            region_code=arguments.get("region_code", "US"),
        )
    if tool_name == "geocode_address":
        return await geocode_address(
            address=arguments.get("address", ""),
            region_code=arguments.get("region_code", "US"),
        )
    if tool_name == "compute_route":
        return await compute_route(
            origin_address=arguments.get("origin_address", ""),
            destination_address=arguments.get("destination_address", ""),
            travel_mode=arguments.get("travel_mode", "DRIVE"),
        )
    if tool_name == "find_nearby_places":
        return await find_nearby_places(
            location_address=arguments.get("location_address", ""),
            place_type=arguments.get("place_type", "restaurant"),
            radius_meters=int(arguments.get("radius_meters", 5000)),
        )
    return f"Unknown tool: {tool_name}"
