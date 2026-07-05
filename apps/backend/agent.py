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

You are also a helpful travel planning assistant. You have access to Google Maps Platform tools through a server-side proxy to plan trips.

Available tools:
1. search_places(text_query, region_code="US")
   - Search for places, businesses, addresses, or points of interest.
   - region_code: ISO 3166-1 alpha-2 country code (e.g. "US", "FR", "IN", "GB").

2. geocode_address(address, region_code="US")
   - Convert an address to latitude/longitude coordinates and a place ID.
   - region_code: ISO 3166-1 alpha-2 country code used to bias results.

3. compute_route(origin_address, destination_address, travel_mode="DRIVE")
   - Compute a route between two addresses using the Google Routes API.
   - travel_mode MUST be one of the exact enum values: DRIVE, WALK, BICYCLE, TRANSIT, TWO_WHEELER.
     Do NOT use aliases like "driving", "walking", "car", "bike", "public transport", etc.
   - Both origin_address and destination_address must be non-empty.

4. find_nearby_places(location_address, place_type, radius_meters=5000, region_code="US")
   - Find places of a specific type near an address.
   - place_type must be a single Google Maps place type, e.g. "restaurant", "hotel",
     "gas_station", "cafe", "tourist_attraction", "museum", "shopping_mall".
   - radius_meters is the search radius in meters (default 5000).
   - region_code: ISO 3166-1 alpha-2 country code used to bias geocoding.

Rules for tool calls:
- Use the exact enum values documented above; the backend validates them and rejects aliases.
- For compute_route, always provide clear origin and destination addresses.
- For find_nearby_places, prefer place types from the official list such as restaurant, hotel, gas_station, cafe, tourist_attraction, museum, shopping_mall, park.

You can make multiple tool calls in a loop until you have enough information to answer the user's request.

Final response format — CRITICAL:
- When you have a final answer, you MUST output ONLY valid openui-lang code.
- Do NOT output markdown, HTML, JSON, explanations, or anything else.
- Start with `root = Stack(...)` as the very first line.
- Use Cards, TextContent, Tables, Lists, Tabs, Steps, etc. to present the answer.
- If the answer has multiple sections or categories, lay them out with nested Stacks using direction "row" and wrap=true for clear columns.
- TextContent supports markdown, so you can use bold, lists, and line breaks inside it.
- The system will detect and render your openui-lang code; plain text will look broken to the user.
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
    # Split into paragraphs so long markdown-like text doesn't collapse into one block.
    paragraphs = [p.strip() for p in reply.strip().split("\n\n") if p.strip()]
    body_items: list[str] = []
    for i, para in enumerate(paragraphs):
        para_safe = _escape_openui(para)
        body_items.append(f'p{i} = TextContent("{para_safe}", "default")')
    body_refs = ", ".join(f"p{i}" for i in range(len(body_items)))

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

    body_lines = "\n".join(f"  {item}" for item in body_items)
    code = f"""\
root = Stack([card], "column", "m")
card = Card([title, body{tool_children}])
title = CardHeader("Travel Plan")
body = Stack([{body_refs}], "column", "s")
{body_lines}
{tool_lines}""".strip()
    return code


def looks_like_openui(code: str) -> bool:
    """Heuristic check for valid openui-lang shape."""
    stripped = code.strip()
    return bool(stripped) and stripped.startswith("root = Stack(")


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


async def run_agent_loop_stream(
    user_message: str,
    message_history: list[dict[str, Any]] | None = None,
):
    """
    Stream the Ollama tool-calling agent loop.

    Yields SSE-style events:
        {"type": "content", "delta": str}
        {"type": "tool_call", "name": str}
        {"type": "tool_result", "name": str, "result": str}
        {"type": "done", "reply": str, "openui_code": str, "tool_calls_used": list[str], "messages": list[dict]}
    """
    full_history: list[dict[str, Any]] = list(message_history) if message_history else []

    # Build the context window: system prompt + last 9 history turns + current user message = 10 messages
    context: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    recent_history = full_history[-9:] if len(full_history) > 9 else full_history
    context.extend(_sanitize_for_ollama(m) for m in recent_history)
    context.append({"role": "user", "content": user_message})

    tool_calls_used: list[str] = []
    max_iterations = 10

    for _ in range(max_iterations):
        stream = _ollama_client.chat(
            model=settings.ollama_model,
            messages=context,
            tools=AVAILABLE_TOOLS,
            options={"temperature": 0.2},
            stream=True,
        )

        accumulated_content = ""
        accumulated_tool_calls: list[Any] = []

        for chunk in stream:
            chunk_message = getattr(chunk, "message", None)
            delta = getattr(chunk_message, "content", None) or ""
            if delta:
                accumulated_content += delta
                yield {"type": "content", "delta": delta}

            chunk_tool_calls = getattr(chunk_message, "tool_calls", None)
            if chunk_tool_calls:
                accumulated_tool_calls.extend(chunk_tool_calls)

        assistant_message = {
            "role": "assistant",
            "content": accumulated_content,
            "tool_calls": accumulated_tool_calls,
        }
        context.append(assistant_message)

        if not accumulated_tool_calls:
            break

        for call in accumulated_tool_calls:
            if isinstance(call, dict):
                fn = call.get("function", {})
                tool_name = fn.get("name", "")
                arguments = fn.get("arguments", {}) or {}
            else:
                tool_name = call.function.name
                arguments = call.function.arguments or {}

            if tool_name:
                tool_calls_used.append(tool_name)
                yield {"type": "tool_call", "name": tool_name}

                tool_result = await _execute_tool(tool_name, arguments)
                yield {"type": "tool_result", "name": tool_name, "result": str(tool_result)}

                context.append(
                    {
                        "role": "tool",
                        "tool_name": tool_name,
                        "content": str(tool_result),
                    }
                )
    else:
        # Hit max iterations without a final answer
        fallback = "I made several tool calls but couldn't finalize a response. Please try rephrasing your request."
        context.append({"role": "assistant", "content": fallback})
        yield {"type": "content", "delta": fallback}

    # Collect only the new assistant/tool/turn messages to add to full history
    new_messages = context[len(recent_history) + 1 :]  # skip system + recent_history + current user

    full_history.extend(new_messages)

    final_message = new_messages[-1] if new_messages else {"role": "assistant", "content": ""}
    reply = final_message.get("content", "")

    # Treat the final reply as openui-lang if it looks like it; otherwise wrap it.
    openui_code = reply if looks_like_openui(reply) else render_openui_fallback(reply, tool_calls_used)
    final_message["openui_code"] = openui_code

    yield {
        "type": "done",
        "reply": reply,
        "openui_code": openui_code,
        "tool_calls_used": list(dict.fromkeys(tool_calls_used)),
        "messages": full_history,
    }


async def run_agent_loop(user_message: str, message_history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Non-streaming wrapper around run_agent_loop_stream."""
    result: dict[str, Any] | None = None
    async for event in run_agent_loop_stream(user_message, message_history):
        if event["type"] == "done":
            result = {
                "reply": event["reply"],
                "openui_code": event["openui_code"],
                "tool_calls_used": event["tool_calls_used"],
                "messages": event["messages"],
            }
    if result is None:
        return {
            "reply": "",
            "openui_code": None,
            "tool_calls_used": [],
            "messages": list(message_history) if message_history else [],
        }
    return result


async def _execute_tool(tool_name: str, arguments: dict[str, Any]) -> str:
    """Run a Google Maps tool and return its output, or the error message on failure.

    Tool failures are returned as text (not raised) so the model can see the
    problem and recover instead of crashing the chat request.
    """
    try:
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
                region_code=arguments.get("region_code", "US"),
            )
        return f"Unknown tool: {tool_name}"
    except Exception as exc:  # noqa: BLE001 - tool errors must be surfaced to the model
        error_msg = f"Tool '{tool_name}' failed: {type(exc).__name__}: {exc}"
        return error_msg
