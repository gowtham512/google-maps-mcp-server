import pytest

from maps_tools import MapsClient


@pytest.mark.asyncio
async def test_search_places(mocker):
    fake_response = {
        "places": [
            {
                "displayName": {"text": "Central Park"},
                "formattedAddress": "New York, NY, USA",
                "rating": 4.8,
                "location": {"latitude": 40.785091, "longitude": -73.968285},
            }
        ]
    }

    client = MapsClient(api_key="fake-key")
    mocker.patch.object(
        client, "_post", return_value=fake_response
    )

    result = await client.search_places("parks in New York")
    assert "Central Park" in result
    assert "New York, NY, USA" in result
    assert "4.8" in result


@pytest.mark.asyncio
async def test_compute_route(mocker):
    fake_response = {
        "routes": [
            {
                "duration": "1800s",
                "distanceMeters": 15000,
            }
        ]
    }

    client = MapsClient(api_key="fake-key")
    mocker.patch.object(client, "_post", return_value=fake_response)

    result = await client.compute_route("Austin, TX", "Dallas, TX")
    assert "15.0 km" in result
    assert "DRIVE" in result


# ---------------------------------------------------------------------------
# Tests for the newer tools that use httpx.AsyncClient directly
# ---------------------------------------------------------------------------

from unittest.mock import AsyncMock, MagicMock

import maps_tools


def _patch_httpx(mocker, payload):
    """Patch maps_tools.httpx.AsyncClient so post/get return *payload* as JSON."""
    resp = MagicMock()
    resp.json = MagicMock(return_value=payload)
    resp.raise_for_status = MagicMock()
    client = MagicMock()
    client.post = AsyncMock(return_value=resp)
    client.get = AsyncMock(return_value=resp)
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=client)
    ctx.__aexit__ = AsyncMock(return_value=False)
    mocker.patch("maps_tools.httpx.AsyncClient", return_value=ctx)
    return client


@pytest.mark.asyncio
async def test_get_distance_matrix(mocker):
    payload = [
        {"originIndex": 0, "destinationIndex": 0, "distanceMeters": 15000, "duration": "1800s", "condition": "ROUTE_EXISTS"},
    ]
    _patch_httpx(mocker, payload)
    result = await maps_tools.get_distance_matrix(["Austin, TX"], ["Dallas, TX"], "DRIVE")
    assert "15.0 km" in result
    assert "Austin, TX" in result
    assert "Dallas, TX" in result


@pytest.mark.asyncio
async def test_get_distance_matrix_requires_inputs(mocker):
    _patch_httpx(mocker, [])
    result = await maps_tools.get_distance_matrix([], ["Dallas, TX"])
    assert "required" in result.lower()


@pytest.mark.asyncio
async def test_compute_route_with_waypoints(mocker):
    payload = {
        "routes": [
            {
                "distanceMeters": 30000,
                "duration": "3600s",
                "legs": [
                    {"distanceMeters": 15000, "duration": "1800s"},
                    {"distanceMeters": 15000, "duration": "1800s"},
                ],
            }
        ]
    }
    _patch_httpx(mocker, payload)
    result = await maps_tools.compute_route_with_waypoints(
        "Austin, TX", "Dallas, TX", ["Waco, TX"], "DRIVE"
    )
    assert "30.0 km" in result
    assert "Waco, TX" in result
    assert "Legs:" in result


@pytest.mark.asyncio
async def test_autocomplete_place(mocker):
    payload = {
        "suggestions": [
            {"placePrediction": {"text": {"text": "Eiffel Tower, Paris"}, "placeId": "abc123"}},
        ]
    }
    _patch_httpx(mocker, payload)
    result = await maps_tools.autocomplete_place("eiffel")
    assert "Eiffel Tower, Paris" in result
    assert "abc123" in result


@pytest.mark.asyncio
async def test_get_static_map_image():
    # No network call — builds a URL directly.
    result = await maps_tools.get_static_map_image("Eiffel Tower, Paris", zoom=15, markers=["Louvre, Paris"])
    assert "staticmap" in result
    assert "Eiffel+Tower" in result or "Eiffel%20Tower" in result
    assert "zoom=15" in result
    assert "markers=" in result


@pytest.mark.asyncio
async def test_get_pollen(mocker):
    mocker.patch("maps_tools._geocode_latlng", AsyncMock(return_value=(48.85, 2.35, "Paris, France")))
    payload = {
        "dailyInfo": [
            {
                "date": {"year": 2026, "month": 7, "day": 20},
                "pollenTypeInfo": [
                    {"displayName": "Grass", "indexInfo": {"category": "Low", "value": 1}},
                ],
            }
        ]
    }
    _patch_httpx(mocker, payload)
    result = await maps_tools.get_pollen("Paris, France")
    assert "Paris, France" in result
    assert "Grass" in result
    assert "Low" in result


@pytest.mark.asyncio
async def test_validate_address(mocker):
    payload = {
        "result": {
            "verdict": {"addressComplete": True, "hasUnconfirmedComponents": False},
            "address": {"formattedAddress": "1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA", "addressComponents": []},
        }
    }
    _patch_httpx(mocker, payload)
    result = await maps_tools.validate_address("1600 amphitheatre pkwy mountain view")
    assert "1600 Amphitheatre Pkwy" in result
    assert "Complete: Yes" in result
