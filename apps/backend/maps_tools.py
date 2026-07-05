import json
from typing import Any

import httpx

from config import settings


class MapsClient:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.maps_api_key

    async def _post(self, url: str, headers: dict[str, str], payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            return resp.json()

    async def _get(self, url: str, params: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            return resp.json()

    async def search_places(self, text_query: str, region_code: str = "US") -> str:
        """Search for places, businesses, addresses, or points of interest using Google Maps."""
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
        """Convert an address into latitude/longitude coordinates and a place ID."""
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
        """Compute a route between two addresses using Google Maps Routes API."""
        url = f"{settings.maps_api_base_url_routes}:computeRoutes"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
        }
        payload = {
            "origin": {"address": origin_address},
            "destination": {"address": destination_address},
            "travelMode": travel_mode.upper(),
            "computeAlternativeRoutes": False,
            "languageCode": "en-US",
            "units": "METRIC",
        }
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
            f"Travel mode: {travel_mode}\n"
            f"Duration: {duration}\n"
            f"Distance: {distance_km:.1f} km"
        )

    async def find_nearby_places(self, location_address: str, place_type: str, radius_meters: int = 5000) -> str:
        """Find places of a specific type near an address."""
        # First geocode the address to get lat/lng
        geo_params = {"address": location_address, "key": self.api_key}
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
    """Search for places, businesses, addresses, or points of interest."""
    return await MapsClient().search_places(text_query, region_code)


async def geocode_address(address: str, region_code: str = "US") -> str:
    """Convert an address into latitude/longitude coordinates and a place ID."""
    return await MapsClient().geocode_address(address, region_code)


async def compute_route(
    origin_address: str,
    destination_address: str,
    travel_mode: str = "DRIVE",
) -> str:
    """Compute a driving or walking route between two addresses."""
    return await MapsClient().compute_route(origin_address, destination_address, travel_mode)


async def find_nearby_places(location_address: str, place_type: str, radius_meters: int = 5000) -> str:
    """Find places of a specific type (e.g. restaurant, hotel, gas_station) near an address."""
    return await MapsClient().find_nearby_places(location_address, place_type, radius_meters)