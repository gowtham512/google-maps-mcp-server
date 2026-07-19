"""Tavily web search and content extraction tools.

Server-side proxy for the Tavily API (https://api.tavily.com), exposed to the
agent as async tools. These complement the Google Maps tools by providing
real-time web information (events, visa rules, seasonal info, news, prices)
and deep extraction of specific web pages.

All calls are made from the backend so the API key is never exposed to the
browser. Every function returns a formatted string; failures are raised as
exceptions and surfaced to the model by the agent's `_execute_tool` wrapper.
"""

from typing import Any

import httpx

from config import settings

# Valid enum values accepted by the Tavily API.
_VALID_SEARCH_DEPTHS = {"basic", "advanced", "fast", "ultra-fast"}
_VALID_TOPICS = {"general", "news", "finance"}
_VALID_TIME_RANGES = {"day", "week", "month", "year", "d", "w", "m", "y"}
_VALID_EXTRACT_DEPTHS = {"basic", "advanced"}
_VALID_FORMATS = {"markdown", "text"}

# Tavily limits: max 20 URLs per extract request.
_MAX_EXTRACT_URLS = 20


def _auth_headers() -> dict[str, str]:
    """Build the Tavily bearer-auth headers, raising if no key is configured."""
    if not settings.tavily_api_key:
        raise ValueError(
            "TAVILY_API_KEY is not configured. Set it in the environment/.env to use web search."
        )
    return {
        "Authorization": f"Bearer {settings.tavily_api_key}",
        "Content-Type": "application/json",
    }


async def _post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    """POST a JSON payload to a Tavily endpoint and return the parsed response."""
    url = f"{settings.tavily_api_base_url.rstrip('/')}/{path.lstrip('/')}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=_auth_headers(), json=payload)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise httpx.HTTPStatusError(
                f"{exc.response.status_code} {exc.response.reason_phrase}: {exc.response.text}",
                request=exc.request,
                response=exc.response,
            ) from exc
        return resp.json()


# ---------------------------------------------------------------------------
# Web search (Tavily /search)
# ---------------------------------------------------------------------------

async def web_search(
    query: str,
    search_depth: str = "basic",
    topic: str = "general",
    max_results: int = 5,
    include_answer: bool = True,
    time_range: str | None = None,
    include_domains: list[str] | None = None,
    exclude_domains: list[str] | None = None,
) -> str:
    """Search the live web for current information via Tavily.

    Use for anything the Google Maps tools cannot answer: current events and
    festivals during a trip, visa/entry requirements, best time to visit,
    travel advisories, seasonal closures, prices, recent news, and general
    background research.

    Args:
        query: The natural-language search query.
        search_depth: "basic" (default, balanced), "advanced" (highest relevance,
            slower, 2 credits), "fast", or "ultra-fast".
        topic: "general" (default), "news" (real-time current events), or "finance".
        max_results: Number of results to return, 0-20 (default 5).
        include_answer: Include a short LLM-generated answer to the query (default True).
        time_range: Optional recency filter: "day", "week", "month", or "year".
        include_domains: Optional list of domains to restrict results to.
        exclude_domains: Optional list of domains to exclude from results.
    """
    query = (query or "").strip()
    if not query:
        return "A non-empty search query is required."

    search_depth = (search_depth or "basic").strip().lower()
    if search_depth not in _VALID_SEARCH_DEPTHS:
        search_depth = "basic"

    topic = (topic or "general").strip().lower()
    if topic not in _VALID_TOPICS:
        topic = "general"

    try:
        max_results = int(max_results)
    except (TypeError, ValueError):
        max_results = 5
    max_results = max(1, min(max_results, 20))

    payload: dict[str, Any] = {
        "query": query,
        "search_depth": search_depth,
        "topic": topic,
        "max_results": max_results,
        "include_answer": bool(include_answer),
    }
    if time_range:
        tr = str(time_range).strip().lower()
        if tr in _VALID_TIME_RANGES:
            payload["time_range"] = tr
    if include_domains:
        payload["include_domains"] = [d for d in include_domains if d and d.strip()]
    if exclude_domains:
        payload["exclude_domains"] = [d for d in exclude_domains if d and d.strip()]

    data = await _post("/search", payload)

    lines: list[str] = [f"Web search results for: {query}"]

    answer = data.get("answer")
    if answer:
        lines.append(f"\nAnswer: {answer}")

    results = data.get("results", []) or []
    if not results:
        lines.append("\nNo web results found.")
        return "\n".join(lines)

    lines.append("\nSources:")
    for i, r in enumerate(results, start=1):
        title = r.get("title", "(no title)")
        url = r.get("url", "")
        content = (r.get("content") or "").strip()
        score = r.get("score")
        header = f"{i}. {title}"
        if score is not None:
            header += f" (relevance {score:.2f})"
        lines.append(header)
        if url:
            lines.append(f"   URL: {url}")
        if content:
            lines.append(f"   {content}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Content extraction (Tavily /extract)
# ---------------------------------------------------------------------------

async def extract_web_content(
    urls: list[str] | str,
    extract_depth: str = "basic",
    format: str = "markdown",
    query: str | None = None,
) -> str:
    """Extract the full cleaned content of one or more web pages via Tavily.

    Use after web_search (or when the user gives a URL) to read a specific page
    in depth — e.g. a hotel page, a tourism-board article, or a visa/entry page.

    Args:
        urls: A single URL string or a list of URLs (up to 20).
        extract_depth: "basic" (default) or "advanced" (retrieves tables and
            embedded content, slower, higher cost).
        format: "markdown" (default) or "text".
        query: Optional user intent used to rerank the extracted content chunks
            by relevance.
    """
    if isinstance(urls, str):
        urls = [urls]
    urls = [u.strip() for u in (urls or []) if u and u.strip()]
    if not urls:
        return "At least one URL is required to extract content."
    if len(urls) > _MAX_EXTRACT_URLS:
        return f"Too many URLs: {len(urls)}. Tavily allows at most {_MAX_EXTRACT_URLS} per request."

    extract_depth = (extract_depth or "basic").strip().lower()
    if extract_depth not in _VALID_EXTRACT_DEPTHS:
        extract_depth = "basic"

    fmt = (format or "markdown").strip().lower()
    if fmt not in _VALID_FORMATS:
        fmt = "markdown"

    payload: dict[str, Any] = {
        "urls": urls,
        "extract_depth": extract_depth,
        "format": fmt,
    }
    if query and query.strip():
        payload["query"] = query.strip()

    data = await _post("/extract", payload)

    results = data.get("results", []) or []
    failed = data.get("failed_results", []) or []

    if not results and not failed:
        return "No content could be extracted from the provided URLs."

    lines: list[str] = []
    for r in results:
        url = r.get("url", "")
        raw = (r.get("raw_content") or r.get("content") or "").strip()
        lines.append(f"Content from {url}:")
        lines.append(raw if raw else "(no content extracted)")
        lines.append("")

    if failed:
        failed_urls = [f.get("url", "") for f in failed]
        lines.append(f"Failed to extract: {', '.join(u for u in failed_urls if u)}")

    return "\n".join(lines).strip()
