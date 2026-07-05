import json
from datetime import datetime, timezone
from typing import Any

import httpx

from config import settings

# Google Maps Platform internal usage attribution ID required by the GMP agent skill.
_GMP_ATTRIBUTION = "gmp_git_agentskills_v1"

# Google Routes API v2 only accepts these exact uppercase enum values.
_VALID_TRAVEL_MODES = {"DRIVE", "WALK", "BICYCLE", "TRANSIT", "TWO_WHEELER"}

# Common aliases the LLM may produce; map them to the official enum value.
_TRAVEL_MODE_ALIASES: dict[str, str] = {
    "drive": "DRIVE",
    "driving": "DRIVE",
    "car": "DRIVE",
    "walk": "WALK",
    "walking": "WALK",
    "foot": "WALK",
    "bike": "BICYCLE",
    "bicycle": "BICYCLE",
    "cycling": "BICYCLE",
    "transit": "TRANSIT",
    "public_transport": "TRANSIT",
    "bus": "TRANSIT",
    "train": "TRANSIT",
    "two_wheeler": "TWO_WHEELER",
    "motorcycle": "TWO_WHEELER",
    "scooter": "TWO_WHEELER",
}


def _normalize_travel_mode(mode: str | None) -> str:
    """Map common aliases to the official Google Routes API travelMode enum."""
    mode = (mode or "DRIVE").strip()
    normalized = _TRAVEL_MODE_ALIASES.get(mode.lower(), mode.upper())
    if normalized not in _VALID_TRAVEL_MODES:
        raise ValueError(
            f"Invalid travel_mode '{mode}'. Must be one of: {', '.join(sorted(_VALID_TRAVEL_MODES))}."
        )
    return normalized


def _now_rfc3339() -> str:
    """Current UTC time in RFC 3339 format, used for transit route requests."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class MapsClient:
    """Server-side proxy for Google Maps Platform REST APIs.

    Calls are made from the backend (not the browser) to avoid CORS blocks.
    """

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.maps_api_key

    def _add_attribution(self, headers: dict[str, str]) -> dict[str, str]:
        headers.setdefault("X-Goog-Maps-Solution-ID", _GMP_ATTRIBUTION)
        return headers

    async def _post(self, url: str, headers: dict[str, str], payload: dict[str, Any]) -> dict[str, Any]:
        headers = self._add_attribution(headers)
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise httpx.HTTPStatusError(
                    f"{exc.response.status_code} {exc.response.reason_phrase}: {exc.response.text}",
                    request=exc.request,
                    response=exc.response,
                ) from exc
            return resp.json()

    async def _get(self, url: str, params: dict[str, Any]) -> dict[str, Any]:
        params.setdefault("solution_id", _GMP_ATTRIBUTION)
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, params=params)
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise httpx.HTTPStatusError(
                    f"{exc.response.status_code} {exc.response.reason_phrase}: {exc.response.text}",
                    request=exc.request,
                    response=exc.response,
                ) from exc
            return resp.json()

    async def search_places(self, text_query: str, region_code: str = "US") -> str:
        """Search for places, businesses, addresses, or points of interest using Google Maps.

        Args:
            text_query: Free-text query such as "restaurants in Paris" or a business name.
            region_code: ISO 3166-1 alpha-2 country/region code (e.g. "US", "FR", "IN")
                used to bias results. Default is "US".
        """
        url = f"{settings.maps_api_base_url_places}/places:searchText"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": (
                "places.id,places.displayName.text,places.formattedAddress,"
                "places.priceLevel,places.rating,places.regularOpeningHours.weekdayDescriptions,"
                "places.location"
            ),
        }
        payload = {"textQuery": text_query, "regionCode": region_code}
        data = await self._post(url, headers, payload)

        places = data.get("places", [])
        if not places:
            return "No places found."

        lines = []
        for idx, place in enumerate(places[:5], start=1):
            name = place.get("displayName", {}).get("text", "Unknown")
            address = place.get("formattedAddress", "")
            rating = place.get("rating")
            price = place.get("priceLevel", "")
            lat = place.get("location", {}).get("latitude")
            lng = place.get("location", {}).get("longitude")
            item = f"{idx}. {name}"
            if address:
                item += f"\n   Address: {address}"
            if rating:
                item += f"\n   Rating: {rating}"
            if price:
                item += f"\n   Price level: {price}"
            if lat is not None and lng is not None:
                item += f"\n   Location: ({lat}, {lng})"
            lines.append(item)

        return "\n\n".join(lines)

    async def geocode_address(self, address: str, region_code: str = "US") -> str:
        """Convert a human-readable address into latitude/longitude coordinates and a place ID.

        Args:
            address: The address to geocode, e.g. "1600 Amphitheatre Parkway, Mountain View, CA".
            region_code: ISO 3166-1 alpha-2 country/region code (e.g. "US", "FR", "IN")
                used to bias ambiguous addresses. Default is "US".
        """
        params = {"address": address, "key": self.api_key, "region": region_code}
        data = await self._get(settings.maps_api_base_url_geocoding, params)

        results = data.get("results", [])
        if not results:
            return f"Could not geocode address: {address}"

        result = results[0]
        loc = result["geometry"]["location"]
        place_id = result.get("place_id", "")
        formatted = result.get("formatted_address", "")
        return (
            f"Geocoded: {formatted}\n"
            f"Place ID: {place_id}\n"
            f"Latitude: {loc['lat']}, Longitude: {loc['lng']}"
        )

    async def compute_route(
        self,
        origin_address: str,
        destination_address: str,
        travel_mode: str = "DRIVE",
    ) -> str:
        """Compute a route between two addresses using the Google Maps Routes API.

        Args:
            origin_address: Starting address (must be non-empty).
            destination_address: Ending address (must be non-empty).
            travel_mode: One of the exact Routes API enum values: DRIVE, WALK,
                BICYCLE, TRANSIT, TWO_WHEELER. Do NOT use "driving", "walking",
                "car", "bike", etc. TRANSIT requires a departureTime and will use
                "now" if not provided. Default is "DRIVE".
        """
        if not origin_address or not origin_address.strip():
            raise ValueError("origin_address is required.")
        if not destination_address or not destination_address.strip():
            raise ValueError("destination_address is required.")

        normalized_mode = _normalize_travel_mode(travel_mode)

        url = f"{settings.maps_api_base_url_routes}:computeRoutes"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
        }
        payload: dict[str, Any] = {
            "origin": {"address": origin_address},
            "destination": {"address": destination_address},
            "travelMode": normalized_mode,
            "computeAlternativeRoutes": False,
            "languageCode": "en-US",
            "units": "METRIC",
        }

        # Transit routes require a departureTime or arrivalTime in the request.
        if normalized_mode == "TRANSIT":
            payload["departureTime"] = _now_rfc3339()

        data = await self._post(url, headers, payload)

        routes = data.get("routes", [])
        if not routes:
            return "No route found."

        route = routes[0]
        duration = route.get("duration", "")
        distance_meters = route.get("distanceMeters", 0)
        distance_km = distance_meters / 1000 if distance_meters else 0
        return (
            f"Route from {origin_address} to {destination_address}:\n"
            f"Travel mode: {normalized_mode}\n"
            f"Duration: {duration}\n"
            f"Distance: {distance_km:.1f} km"
        )

    async def find_nearby_places(
        self,
        location_address: str,
        place_type: str,
        radius_meters: int = 5000,
        region_code: str = "US",
    ) -> str:
        """Find places of a specific type near an address.

        Args:
            location_address: Center address used to anchor the nearby search.
            place_type: A single Google Maps place type, e.g. "restaurant",
                "hotel", "gas_station", "cafe", "tourist_attraction".
                See https://developers.google.com/maps/documentation/places/web-api/place-types.
            radius_meters: Search radius in meters around the location. Default 5000.
            region_code: ISO 3166-1 alpha-2 country/region code (e.g. "US", "FR", "IN")
                used to bias geocoding of the location address. Default is "US".
        """
        # First geocode the address to get lat/lng.
        geo_params = {"address": location_address, "key": self.api_key, "region": region_code}
        geo_data = await self._get(settings.maps_api_base_url_geocoding, geo_params)
        geo_results = geo_data.get("results", [])
        if not geo_results:
            return f"Could not locate address: {location_address}"

        loc = geo_results[0]["geometry"]["location"]
        lat, lng = loc["lat"], loc["lng"]

        url = f"{settings.maps_api_base_url_places}/places:searchNearby"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": (
                "places.id,places.displayName.text,places.formattedAddress,"
                "places.rating,places.priceLevel"
            ),
        }
        payload = {
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": lat, "longitude": lng},
                    "radius": radius_meters,
                }
            },
            "includedTypes": [place_type],
        }
        data = await self._post(url, headers, payload)

        places = data.get("places", [])
        if not places:
            return f"No {place_type} found near {location_address}."

        lines = [f"{place_type} near {location_address}:", ""]
        for idx, place in enumerate(places[:5], start=1):
            name = place.get("displayName", {}).get("text", "Unknown")
            address = place.get("formattedAddress", "")
            rating = place.get("rating")
            item = f"{idx}. {name}"
            if address:
                item += f"\n   Address: {address}"
            if rating:
                item += f"\n   Rating: {rating}"
            lines.append(item)

        return "\n\n".join(lines)


async def search_places(text_query: str, region_code: str = "US") -> str:
    """Search for places, businesses, addresses, or points of interest.

    Args:
        text_query: Free-text query such as a business name or "hotels in Paris".
        region_code: ISO 3166-1 alpha-2 country/region code (e.g. "US", "FR", "IN").
            Default is "US".
    """
    return await MapsClient().search_places(text_query, region_code)


async def geocode_address(address: str, region_code: str = "US") -> str:
    """Convert an address into latitude/longitude coordinates and a place ID.

    Args:
        address: The address to geocode.
        region_code: ISO 3166-1 alpha-2 country/region code (e.g. "US", "FR", "IN").
            Default is "US".
    """
    return await MapsClient().geocode_address(address, region_code)


async def compute_route(
    origin_address: str,
    destination_address: str,
    travel_mode: str = "DRIVE",
) -> str:
    """Compute a route between two addresses.

    Args:
        origin_address: Starting address (must be non-empty).
        destination_address: Ending address (must be non-empty).
        travel_mode: Exact enum value: DRIVE, WALK, BICYCLE, TRANSIT, or TWO_WHEELER.
            Do NOT use "driving", "walking", "car", "bike", etc.
            Default is "DRIVE".
    """
    return await MapsClient().compute_route(origin_address, destination_address, travel_mode)


async def find_nearby_places(
    location_address: str,
    place_type: str,
    radius_meters: int = 5000,
    region_code: str = "US",
) -> str:
    """Find places of a specific type near an address.

    Args:
        location_address: Center address for the search.
        place_type: A single Google place type, e.g. "restaurant", "hotel",
            "gas_station", "cafe", "tourist_attraction".
        radius_meters: Search radius in meters. Default 5000.
        region_code: ISO 3166-1 alpha-2 country/region code (e.g. "US", "FR", "IN").
            Default is "US".
    """
    return await MapsClient().find_nearby_places(location_address, place_type, radius_meters, region_code)