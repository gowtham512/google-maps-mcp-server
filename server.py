"""Single-file MCP server for travel planning with Google Maps APIs.

Run:  GOOGLE_MAPS_API_KEY=your_key python server.py

Dependencies: pip install mcp httpx
Source: Google Maps Platform Code Assist (documentation-grounded implementation)
"""

from __future__ import annotations

import os
from typing import Any

import httpx
import uvicorn
from mcp.server.fastmcp import FastMCP
from starlette.responses import JSONResponse

mcp = FastMCP("google-maps-travel-planner")

API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
if not API_KEY:
    raise RuntimeError("GOOGLE_MAPS_API_KEY environment variable is required")

GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json"
ADDRESS_VALIDATION_URL = "https://addressvalidation.googleapis.com/v1:validateAddress"
TIMEZONE_URL = "https://maps.googleapis.com/maps/api/timezone/json"
STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap"
PLACES_URL = "https://places.googleapis.com/v1/places"
ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


def _geo_point(address_or_latlng: str) -> dict[str, float] | None:
    """Return {latitude, longitude} from a 'lat,lng' string."""
    parts = address_or_latlng.replace(" ", "").split(",")
    if len(parts) == 2:
        try:
            return {"latitude": float(parts[0]), "longitude": float(parts[1])}
        except ValueError:
            pass
    return None


@mcp.tool()
async def geocode_address(address: str) -> dict[str, Any]:
    """Convert a street address or place name into latitude/longitude."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GEOCODING_URL,
            params={"address": address, "key": API_KEY},
            timeout=30.0,
        )
    resp.raise_for_status()
    data = resp.json()

    result = data.get("results", [None])[0]
    if not result:
        return {"found": False, "address": address, "error": data.get("status")}

    loc = result["geometry"]["location"]
    return {
        "found": True,
        "address": result["formatted_address"],
        "latitude": loc["lat"],
        "longitude": loc["lng"],
        "place_id": result["place_id"],
    }


@mcp.tool()
async def reverse_geocode(latitude: float, longitude: float) -> dict[str, Any]:
    """Convert latitude/longitude into a human-readable address."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GEOCODING_URL,
            params={"latlng": f"{latitude},{longitude}", "key": API_KEY},
            timeout=30.0,
        )
    resp.raise_for_status()
    data = resp.json()

    result = data.get("results", [None])[0]
    if not result:
        return {"found": False, "error": data.get("status")}

    return {
        "found": True,
        "address": result["formatted_address"],
        "place_id": result["place_id"],
        "types": result.get("types", []),
    }


@mcp.tool()
async def validate_address(address: str) -> dict[str, Any]:
    """Validate and standardize a postal address."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            ADDRESS_VALIDATION_URL,
            headers={"Content-Type": "application/json"},
            params={"key": API_KEY},
            json={"address": {"addressLines": [address]}},
            timeout=30.0,
        )
    resp.raise_for_status()
    data = resp.json()

    verdict = data.get("result", {}).get("verdict", {})
    address_result = data.get("result", {}).get("address", {})
    return {
        "valid": verdict.get("addressComplete", False),
        "normalized_address": address_result.get("formattedAddress"),
        "has_unconfirmed_components": verdict.get("hasUnconfirmedComponents", False),
        "has_inferred_components": verdict.get("hasInferredComponents", False),
        "granularity": address_result.get("addressResolutionResult", "UNKNOWN"),
    }


@mcp.tool()
async def get_timezone(latitude: float, longitude: float) -> dict[str, Any]:
    """Get the time zone for a location."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            TIMEZONE_URL,
            params={"location": f"{latitude},{longitude}", "timestamp": 0, "key": API_KEY},
            timeout=30.0,
        )
    resp.raise_for_status()
    data = resp.json()

    return {
        "time_zone_id": data.get("timeZoneId"),
        "time_zone_name": data.get("timeZoneName"),
        "raw_offset": data.get("rawOffset"),
        "dst_offset": data.get("dstOffset"),
    }


@mcp.tool()
async def search_places(
    location: str,
    radius_meters: int = 1500,
    place_type: str = "restaurant",
    max_results: int = 5,
) -> dict[str, Any]:
    """Find places near a location. Location can be an address or 'lat,lng'."""
    point = _geo_point(location)
    if point is None:
        geo = await geocode_address(location)
        if not geo["found"]:
            return {"found": False, "error": f"Could not geocode: {location}"}
        point = {"latitude": geo["latitude"], "longitude": geo["longitude"]}

    body = {
        "locationRestriction": {
            "circle": {
                "center": {"latitude": point["latitude"], "longitude": point["longitude"]},
                "radius": radius_meters,
            }
        },
        "includedTypes": [place_type],
        "maxResultCount": max_results,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{PLACES_URL}:searchNearby",
            headers={
                "Content-Type": "application/json",
                "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.primaryType,places.internationalPhoneNumber,places.websiteUri",
                "X-Goog-Api-Key": API_KEY,
            },
            json=body,
            timeout=30.0,
        )
    resp.raise_for_status()
    data = resp.json()

    places = [
        {
            "place_id": p.get("id"),
            "name": p.get("displayName", {}).get("text"),
            "address": p.get("formattedAddress"),
            "latitude": p.get("location", {}).get("latitude"),
            "longitude": p.get("location", {}).get("longitude"),
            "rating": p.get("rating"),
            "type": p.get("primaryType"),
            "phone": p.get("internationalPhoneNumber"),
            "website": p.get("websiteUri"),
        }
        for p in data.get("places", [])
    ]
    return {"found": bool(places), "location": point, "places": places}


@mcp.tool()
async def get_place_details(place_id: str) -> dict[str, Any]:
    """Fetch detailed information about a specific place."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{PLACES_URL}/{place_id}",
            headers={
                "X-Goog-FieldMask": "id,displayName,formattedAddress,location,rating,primaryType,internationalPhoneNumber,websiteUri,regularOpeningHours,editorialSummary,photos",
                "X-Goog-Api-Key": API_KEY,
            },
            timeout=30.0,
        )
    resp.raise_for_status()
    p = resp.json()

    return {
        "place_id": p.get("id"),
        "name": p.get("displayName", {}).get("text"),
        "address": p.get("formattedAddress"),
        "latitude": p.get("location", {}).get("latitude"),
        "longitude": p.get("location", {}).get("longitude"),
        "rating": p.get("rating"),
        "type": p.get("primaryType"),
        "phone": p.get("internationalPhoneNumber"),
        "website": p.get("websiteUri"),
        "summary": p.get("editorialSummary", {}).get("text"),
        "open_now": p.get("regularOpeningHours", {}).get("openNow"),
        "photo_count": len(p.get("photos", [])),
    }


@mcp.tool()
async def get_route(
    origin: str,
    destination: str,
    travel_mode: str = "DRIVE",
) -> dict[str, Any]:
    """Get directions between two places. Locations can be addresses or 'lat,lng'."""
    def place_point(loc: str) -> dict[str, Any]:
        point = _geo_point(loc)
        if point:
            return {"location": {"latLng": {"latitude": point["latitude"], "longitude": point["longitude"]}}}
        return {"address": loc}

    body = {
        "origin": place_point(origin),
        "destination": place_point(destination),
        "travelMode": travel_mode,
        "routingPreference": "TRAFFIC_AWARE",
        "computeAlternativeRoutes": False,
        "units": "METRIC",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            ROUTES_URL,
            headers={
                "Content-Type": "application/json",
                "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.legs",
                "X-Goog-Api-Key": API_KEY,
            },
            json=body,
            timeout=30.0,
        )
    resp.raise_for_status()
    data = resp.json()

    route = data.get("routes", [None])[0]
    if not route:
        return {"found": False, "origin": origin, "destination": destination}

    leg = route["legs"][0]
    steps = [
        {
            "instruction": s.get("navigationInstruction", {}).get("instructions", ""),
            "distance_meters": s.get("distanceMeters"),
        }
        for s in leg.get("steps", [])
    ]
    return {
        "found": True,
        "origin": leg.get("startLocation", {}),
        "destination": leg.get("endLocation", {}),
        "distance_meters": route.get("distanceMeters"),
        "duration": route.get("duration"),
        "steps": steps[:20],
    }


@mcp.tool()
async def get_distance_matrix(
    origins: list[str],
    destinations: list[str],
    travel_mode: str = "DRIVE",
) -> dict[str, Any]:
    """Get travel distances and durations between many origins and destinations."""
    def waypoints(locations: list[str]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for loc in locations:
            point = _geo_point(loc)
            if point:
                out.append({"latLng": {"latitude": point["latitude"], "longitude": point["longitude"]}})
            else:
                out.append({"address": loc})
        return out

    body = {
        "origins": waypoints(origins),
        "destinations": waypoints(destinations),
        "travelMode": travel_mode,
        "routingPreference": "TRAFFIC_AWARE",
        "units": "METRIC",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
            headers={
                "Content-Type": "application/json",
                "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
                "X-Goog-Api-Key": API_KEY,
            },
            json=body,
            timeout=30.0,
        )
    resp.raise_for_status()
    data = resp.json()

    rows = [
        {
            "from": origins[row.get("originIndex", 0)],
            "to": destinations[row.get("destinationIndex", 0)],
            "distance_meters": row.get("distanceMeters"),
            "duration": row.get("duration"),
            "condition": row.get("condition"),
        }
        for row in data
    ]
    return {"rows": rows}


@mcp.tool()
async def get_map_image(
    center: str,
    zoom: int = 14,
    width: int = 600,
    height: int = 400,
    markers: list[str] | None = None,
) -> dict[str, Any]:
    """Generate a URL for a static map image of a location."""
    params: dict[str, Any] = {
        "center": center,
        "zoom": zoom,
        "size": f"{width}x{height}",
        "key": API_KEY,
    }
    if markers:
        params["markers"] = [m for m in markers]

    async with httpx.AsyncClient() as client:
        resp = await client.get(STATIC_MAP_URL, params=params, timeout=30.0)
    resp.raise_for_status()

    return {
        "map_image_url": str(resp.url),
        "width": width,
        "height": height,
    }


@mcp.tool()
async def suggest_itinerary(
    destination: str,
    interests: list[str],
    days: int = 1,
) -> dict[str, Any]:
    """Build a simple day-by-day itinerary of places and routes in a destination."""
    geo = await geocode_address(destination)
    if not geo["found"]:
        return {"error": f"Could not locate destination: {destination}"}

    center = f"{geo['latitude']},{geo['longitude']}"
    result: dict[str, Any] = {
        "destination": geo["formatted_address"],
        "center": {"latitude": geo["latitude"], "longitude": geo["longitude"]},
        "days": [],
    }

    for day in range(1, days + 1):
        interest = interests[(day - 1) % len(interests)] if interests else "tourist_attraction"
        search = await search_places(
            location=center,
            radius_meters=5000,
            place_type=interest,
            max_results=3,
        )
        stops = search.get("places", [])
        route_summary = None
        if len(stops) >= 2:
            route = await get_route(stops[0]["address"], stops[-1]["address"])
            route_summary = {
                "distance_meters": route.get("distance_meters"),
                "duration": route.get("duration"),
            }

        result["days"].append(
            {
                "day": day,
                "theme": interest,
                "stops": stops,
                "route_summary": route_summary,
            }
        )

    return result


if __name__ == "__main__":
    transport = os.environ.get("MCP_TRANSPORT", "stdio").lower()
    if transport == "sse":
        host = os.environ.get("MCP_HOST", "0.0.0.0")
        port = int(os.environ.get("MCP_PORT", "3000"))
        app = mcp.sse_app()
        app.add_route("/health", lambda request: JSONResponse({"ok": True}), methods=["GET"])
        uvicorn.run(app, host=host, port=port)
    else:
        mcp.run(transport="stdio")
