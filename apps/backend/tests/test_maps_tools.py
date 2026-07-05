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