"""Tests for the Tavily web_search and extract_web_content tools."""

from unittest.mock import AsyncMock, MagicMock

import pytest

import tavily_tools


@pytest.fixture(autouse=True)
def _fake_api_key(monkeypatch):
    """Ensure a Tavily API key is configured so _auth_headers doesn't raise."""
    monkeypatch.setattr(tavily_tools.settings, "tavily_api_key", "fake-key")


def _patch_httpx(mocker, payload):
    """Patch tavily_tools.httpx.AsyncClient so post returns *payload* as JSON."""
    resp = MagicMock()
    resp.json = MagicMock(return_value=payload)
    resp.raise_for_status = MagicMock()
    client = MagicMock()
    client.post = AsyncMock(return_value=resp)
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=client)
    ctx.__aexit__ = AsyncMock(return_value=False)
    mocker.patch("tavily_tools.httpx.AsyncClient", return_value=ctx)
    return client


# ---------------------------------------------------------------------------
# web_search
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_web_search_formats_answer_and_sources(mocker):
    payload = {
        "query": "best time to visit Kyoto",
        "answer": "Spring (cherry blossoms) and autumn (foliage) are ideal.",
        "results": [
            {
                "title": "When to visit Kyoto",
                "url": "https://example.com/kyoto",
                "content": "Late March to April and November are the best months.",
                "score": 0.93,
            }
        ],
    }
    client = _patch_httpx(mocker, payload)

    result = await tavily_tools.web_search("best time to visit Kyoto")

    assert "Spring (cherry blossoms)" in result
    assert "When to visit Kyoto" in result
    assert "https://example.com/kyoto" in result
    assert "relevance 0.93" in result

    # Verify the request payload was built correctly.
    _, kwargs = client.post.call_args
    body = kwargs["json"]
    assert body["query"] == "best time to visit Kyoto"
    assert body["search_depth"] == "basic"
    assert body["topic"] == "general"
    assert body["include_answer"] is True


@pytest.mark.asyncio
async def test_web_search_normalizes_invalid_params(mocker):
    client = _patch_httpx(mocker, {"results": []})

    await tavily_tools.web_search(
        "events in Paris",
        search_depth="turbo",     # invalid -> basic
        topic="gossip",           # invalid -> general
        max_results=99,           # clamped -> 20
        time_range="week",
    )

    body = client.post.call_args.kwargs["json"]
    assert body["search_depth"] == "basic"
    assert body["topic"] == "general"
    assert body["max_results"] == 20
    assert body["time_range"] == "week"


@pytest.mark.asyncio
async def test_web_search_requires_query(mocker):
    _patch_httpx(mocker, {"results": []})
    result = await tavily_tools.web_search("   ")
    assert "non-empty search query" in result.lower()


@pytest.mark.asyncio
async def test_web_search_no_results(mocker):
    _patch_httpx(mocker, {"query": "x", "results": []})
    result = await tavily_tools.web_search("something obscure")
    assert "No web results found." in result


# ---------------------------------------------------------------------------
# extract_web_content
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_extract_web_content_single_url(mocker):
    payload = {
        "results": [
            {
                "url": "https://en.wikipedia.org/wiki/Kyoto",
                "raw_content": "Kyoto is a city in Japan.",
            }
        ],
        "failed_results": [],
    }
    client = _patch_httpx(mocker, payload)

    result = await tavily_tools.extract_web_content("https://en.wikipedia.org/wiki/Kyoto")

    assert "Kyoto is a city in Japan." in result
    assert "https://en.wikipedia.org/wiki/Kyoto" in result

    body = client.post.call_args.kwargs["json"]
    assert body["urls"] == ["https://en.wikipedia.org/wiki/Kyoto"]
    assert body["extract_depth"] == "basic"
    assert body["format"] == "markdown"


@pytest.mark.asyncio
async def test_extract_web_content_reports_failures(mocker):
    payload = {
        "results": [],
        "failed_results": [{"url": "https://broken.example.com"}],
    }
    _patch_httpx(mocker, payload)

    result = await tavily_tools.extract_web_content(["https://broken.example.com"])
    assert "Failed to extract" in result
    assert "https://broken.example.com" in result


@pytest.mark.asyncio
async def test_extract_web_content_requires_url(mocker):
    _patch_httpx(mocker, {"results": []})
    result = await tavily_tools.extract_web_content([])
    assert "At least one URL is required" in result


@pytest.mark.asyncio
async def test_extract_web_content_rejects_too_many_urls(mocker):
    _patch_httpx(mocker, {"results": []})
    urls = [f"https://example.com/{i}" for i in range(21)]
    result = await tavily_tools.extract_web_content(urls)
    assert "at most 20" in result


# ---------------------------------------------------------------------------
# Missing API key
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_web_search_without_api_key_raises(mocker, monkeypatch):
    monkeypatch.setattr(tavily_tools.settings, "tavily_api_key", "")
    _patch_httpx(mocker, {"results": []})
    with pytest.raises(ValueError, match="TAVILY_API_KEY"):
        await tavily_tools.web_search("anything")
