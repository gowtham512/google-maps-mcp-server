import json
from typing import Any

import ollama

from config import settings
from maps_tools import compute_route, find_nearby_places, geocode_address, search_places


AVAILABLE_TOOLS = [search_places, geocode_address, compute_route, find_nearby_places]

SYSTEM_PROMPT = """\
You are a helpful travel planning assistant. You have access to Google Maps tools to help users plan trips.

Available tools:
1. search_places - Search for places, businesses, addresses, or points of interest.
2. geocode_address - Convert an address to coordinates and place ID.
3. compute_route - Compute driving or walking routes between two addresses.
4. find_nearby_places - Find places of a specific type near an address (e.g., hotels, restaurants, gas stations).

You can make multiple tool calls in a loop until you have enough information to answer the user's request.
When you have a final answer, respond directly to the user with a clear, concise travel plan.
"""


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
    context.extend(recent_history)
    context.append({"role": "user", "content": user_message})

    tool_calls_used: list[str] = []
    max_iterations = 5

    for _ in range(max_iterations):
        response = ollama.chat(
            model=settings.ollama_model,
            messages=context,
            tools=AVAILABLE_TOOLS,
            options={"temperature": 0.2},
            host=settings.ollama_base_url,
        )

        assistant_message = response.message
        context.append(assistant_message)

        # Handle both SDK object and plain dict shapes (useful for mocking/tests)
        if isinstance(assistant_message, dict):
            calls = assistant_message.get("tool_calls") or []
            if calls:
                calls = [
                    type("Call", (), {"function": type("Fn", (), {"name": c.get("function", {}).get("name"), "arguments": c.get("function", {}).get("arguments", {})})()})
                    for c in calls
                ]
        else:
            calls = assistant_message.tool_calls
        if not calls:
            break

        for call in calls:
            tool_name = call.function.name
            tool_calls_used.append(tool_name)
            arguments = call.function.arguments or {}

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
    reply = final_message.get("content", "") if isinstance(final_message, dict) else getattr(final_message, "content", "")

    return {
        "reply": reply,
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