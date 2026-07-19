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


# ---------------------------------------------------------------------------
# Weather API
# ---------------------------------------------------------------------------

class WeatherClient:
    """Client for the Google Maps Platform Weather API."""

    _BASE = "https://weather.googleapis.com/v1"

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.maps_api_key

    async def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        params["key"] = self.api_key
        url = f"{self._BASE}/{path}"
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

    async def get_current_conditions(self, lat: float, lng: float) -> str:
        data = await self._get("currentConditions:lookup", {
            "location.latitude": lat,
            "location.longitude": lng,
        })
        cond = data.get("currentConditions", data)
        temp_c = cond.get("temperature", {}).get("degrees")
        feels_c = cond.get("feelsLikeTemperature", {}).get("degrees")
        humidity = cond.get("relativeHumidity")
        desc = cond.get("weatherCondition", {}).get("description", {}).get("text", "")
        wind_speed = cond.get("wind", {}).get("speed", {}).get("value")
        wind_unit = cond.get("wind", {}).get("speed", {}).get("unit", "KPH")
        uv = cond.get("uvIndex")
        visibility = cond.get("visibility", {}).get("distance")
        vis_unit = cond.get("visibility", {}).get("unit", "KM")

        lines = [f"Current conditions: {desc}"]
        if temp_c is not None:
            lines.append(f"Temperature: {temp_c}°C" + (f" (feels like {feels_c}°C)" if feels_c is not None else ""))
        if humidity is not None:
            lines.append(f"Humidity: {humidity}%")
        if wind_speed is not None:
            lines.append(f"Wind: {wind_speed} {wind_unit}")
        if uv is not None:
            lines.append(f"UV index: {uv}")
        if visibility is not None:
            lines.append(f"Visibility: {visibility} {vis_unit}")
        return "\n".join(lines)

    async def get_forecast(self, lat: float, lng: float, days: int = 5) -> str:
        data = await self._get("forecast/days:lookup", {
            "location.latitude": lat,
            "location.longitude": lng,
            "days": min(days, 10),
        })
        forecasts = data.get("forecastDays", [])
        if not forecasts:
            return "No forecast available."
        lines = [f"{days}-day forecast:"]
        for day in forecasts[:days]:
            date_str = day.get("interval", {}).get("startTime", "")[:10]
            day_part = day.get("daytimeForecast", {})
            night_part = day.get("nighttimeForecast", {})
            high = day.get("maxTemperature", {}).get("degrees")
            low = day.get("minTemperature", {}).get("degrees")
            desc = day_part.get("weatherCondition", {}).get("description", {}).get("text", "")
            precip = day_part.get("precipitationProbability")
            line = f"{date_str}: {desc}"
            if high is not None and low is not None:
                line += f" | High {high}°C / Low {low}°C"
            if precip is not None:
                line += f" | Rain {precip}%"
            lines.append(line)
        return "\n".join(lines)


async def get_weather(location_address: str, include_forecast: bool = True, forecast_days: int = 5) -> str:
    """Get current weather conditions and forecast for a location.

    Args:
        location_address: Address or city name to get weather for, e.g. "Tokyo, Japan".
        include_forecast: Whether to include a multi-day forecast. Default True.
        forecast_days: Number of forecast days to return (1–10). Default 5.
    """
    # Geocode first to get coordinates
    maps = MapsClient()
    geo_params = {"address": location_address, "key": maps.api_key}
    geo_data = await maps._get(settings.maps_api_base_url_geocoding, geo_params)
    results = geo_data.get("results", [])
    if not results:
        return f"Could not locate: {location_address}"
    loc = results[0]["geometry"]["location"]
    lat, lng = loc["lat"], loc["lng"]
    formatted = results[0].get("formatted_address", location_address)

    weather = WeatherClient()
    parts = [f"Weather for {formatted}:", ""]

    try:
        current = await weather.get_current_conditions(lat, lng)
        parts.append(current)
    except Exception as exc:
        parts.append(f"Current conditions unavailable: {exc}")

    if include_forecast:
        parts.append("")
        try:
            forecast = await weather.get_forecast(lat, lng, forecast_days)
            parts.append(forecast)
        except Exception as exc:
            parts.append(f"Forecast unavailable: {exc}")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Time Zone API
# ---------------------------------------------------------------------------

async def get_timezone(location_address: str) -> str:
    """Get the local time zone and current local time for a location.

    Args:
        location_address: Address or city name to get time zone info for.
    """
    maps = MapsClient()
    geo_params = {"address": location_address, "key": maps.api_key}
    geo_data = await maps._get(settings.maps_api_base_url_geocoding, geo_params)
    results = geo_data.get("results", [])
    if not results:
        return f"Could not locate: {location_address}"
    loc = results[0]["geometry"]["location"]
    lat, lng = loc["lat"], loc["lng"]
    formatted = results[0].get("formatted_address", location_address)

    timestamp = int(datetime.now(timezone.utc).timestamp())
    url = "https://maps.googleapis.com/maps/api/timezone/json"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, params={
            "location": f"{lat},{lng}",
            "timestamp": timestamp,
            "key": maps.api_key,
        })
        resp.raise_for_status()
        data = resp.json()

    status = data.get("status")
    if status != "OK":
        return f"Time zone lookup failed for {formatted}: {status}"

    tz_id = data.get("timeZoneId", "Unknown")
    tz_name = data.get("timeZoneName", "")
    raw_offset = data.get("rawOffset", 0)        # seconds from UTC (no DST)
    dst_offset = data.get("dstOffset", 0)        # DST offset in seconds
    total_offset = raw_offset + dst_offset
    offset_hours = total_offset / 3600
    sign = "+" if offset_hours >= 0 else ""

    # Compute local time
    local_ts = timestamp + total_offset
    local_dt = datetime.fromtimestamp(local_ts, tz=timezone.utc)
    local_time_str = local_dt.strftime("%I:%M %p, %A %d %B %Y")

    lines = [
        f"Time zone for {formatted}:",
        f"Time zone: {tz_name} ({tz_id})",
        f"UTC offset: UTC{sign}{offset_hours:.1f}",
        f"Local time: {local_time_str}",
    ]
    if dst_offset != 0:
        lines.append(f"DST active: +{dst_offset // 3600} hour(s)")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Place Details (Places API v2)
# ---------------------------------------------------------------------------

async def get_place_details(place_id: str) -> str:
    """Get detailed information about a specific place using its place ID.

    Returns opening hours, phone number, website, rating, reviews, and photo references.

    Args:
        place_id: The Google Maps place ID (from search_places or geocode_address results).
    """
    maps = MapsClient()
    url = f"{settings.maps_api_base_url_places}/places/{place_id}"
    field_mask = (
        "id,displayName,formattedAddress,location,"
        "rating,userRatingCount,priceLevel,"
        "regularOpeningHours,currentOpeningHours,"
        "internationalPhoneNumber,websiteUri,"
        "editorialSummary,reviews,"
        "photos,types"
    )
    headers = {
        "X-Goog-Api-Key": maps.api_key,
        "X-Goog-FieldMask": field_mask,
        "X-Goog-Maps-Solution-ID": _GMP_ATTRIBUTION,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=headers)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise httpx.HTTPStatusError(
                f"{exc.response.status_code} {exc.response.reason_phrase}: {exc.response.text}",
                request=exc.request,
                response=exc.response,
            ) from exc
        data = resp.json()

    lines: list[str] = []
    name = data.get("displayName", {}).get("text", "Unknown")
    lines.append(f"Place: {name}")

    address = data.get("formattedAddress")
    if address:
        lines.append(f"Address: {address}")

    rating = data.get("rating")
    count = data.get("userRatingCount")
    if rating:
        lines.append(f"Rating: {rating}/5" + (f" ({count} reviews)" if count else ""))

    price = data.get("priceLevel")
    if price:
        price_map = {
            "PRICE_LEVEL_FREE": "Free",
            "PRICE_LEVEL_INEXPENSIVE": "$",
            "PRICE_LEVEL_MODERATE": "$$",
            "PRICE_LEVEL_EXPENSIVE": "$$$",
            "PRICE_LEVEL_VERY_EXPENSIVE": "$$$$",
        }
        lines.append(f"Price: {price_map.get(price, price)}")

    phone = data.get("internationalPhoneNumber")
    if phone:
        lines.append(f"Phone: {phone}")

    website = data.get("websiteUri")
    if website:
        lines.append(f"Website: {website}")

    summary = data.get("editorialSummary", {}).get("text")
    if summary:
        lines.append(f"Summary: {summary}")

    # Opening hours
    opening = data.get("currentOpeningHours") or data.get("regularOpeningHours", {})
    is_open = opening.get("openNow")
    if is_open is not None:
        lines.append(f"Open now: {'Yes' if is_open else 'No'}")
    weekday_text = opening.get("weekdayDescriptions", [])
    if weekday_text:
        lines.append("Hours:")
        for day in weekday_text:
            lines.append(f"  {day}")

    # Photo references (first 3)
    photos = data.get("photos", [])[:3]
    if photos:
        lines.append("Photo references:")
        for photo in photos:
            ref = photo.get("name", "")
            if ref:
                photo_url = (
                    f"https://places.googleapis.com/v1/{ref}/media"
                    f"?maxHeightPx=400&key={maps.api_key}"
                )
                lines.append(f"  {photo_url}")

    # Top reviews (first 2)
    reviews = data.get("reviews", [])[:2]
    if reviews:
        lines.append("Top reviews:")
        for rev in reviews:
            author = rev.get("authorAttribution", {}).get("displayName", "Anonymous")
            rating_r = rev.get("rating")
            text = rev.get("text", {}).get("text", "")[:200]
            lines.append(f"  {author} ({rating_r}/5): {text}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Elevation API
# ---------------------------------------------------------------------------

async def get_elevation(location_address: str) -> str:
    """Get the elevation (altitude above sea level) for a location.

    Args:
        location_address: Address or place name to get elevation for.
    """
    maps = MapsClient()
    geo_params = {"address": location_address, "key": maps.api_key}
    geo_data = await maps._get(settings.maps_api_base_url_geocoding, geo_params)
    results = geo_data.get("results", [])
    if not results:
        return f"Could not locate: {location_address}"
    loc = results[0]["geometry"]["location"]
    lat, lng = loc["lat"], loc["lng"]
    formatted = results[0].get("formatted_address", location_address)

    url = "https://maps.googleapis.com/maps/api/elevation/json"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, params={
            "locations": f"{lat},{lng}",
            "key": maps.api_key,
        })
        resp.raise_for_status()
        data = resp.json()

    status = data.get("status")
    if status != "OK":
        return f"Elevation lookup failed for {formatted}: {status}"

    elev_results = data.get("results", [])
    if not elev_results:
        return "No elevation data returned."

    elevation_m = elev_results[0].get("elevation", 0)
    elevation_ft = elevation_m * 3.28084
    resolution_m = elev_results[0].get("resolution", 0)

    return (
        f"Elevation for {formatted}:\n"
        f"Altitude: {elevation_m:.1f} m ({elevation_ft:.0f} ft) above sea level\n"
        f"Data resolution: {resolution_m:.0f} m"
    )


# ---------------------------------------------------------------------------
# Air Quality API
# ---------------------------------------------------------------------------

async def get_air_quality(location_address: str) -> str:
    """Get current air quality index (AQI) and pollutant breakdown for a location.

    Args:
        location_address: Address or city name to check air quality for.
    """
    maps = MapsClient()
    geo_params = {"address": location_address, "key": maps.api_key}
    geo_data = await maps._get(settings.maps_api_base_url_geocoding, geo_params)
    results = geo_data.get("results", [])
    if not results:
        return f"Could not locate: {location_address}"
    loc = results[0]["geometry"]["location"]
    lat, lng = loc["lat"], loc["lng"]
    formatted = results[0].get("formatted_address", location_address)

    url = "https://airquality.googleapis.com/v1/currentConditions:lookup"
    payload = {
        "location": {"latitude": lat, "longitude": lng},
        "universalAqi": True,
        "extraComputations": ["POLLUTANT_CONCENTRATION", "LOCAL_AQI", "HEALTH_RECOMMENDATIONS"],
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Maps-Solution-ID": _GMP_ATTRIBUTION,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            headers=headers,
            params={"key": maps.api_key},
            json=payload,
        )
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise httpx.HTTPStatusError(
                f"{exc.response.status_code} {exc.response.reason_phrase}: {exc.response.text}",
                request=exc.request,
                response=exc.response,
            ) from exc
        data = resp.json()

    lines = [f"Air quality for {formatted}:"]

    # Universal AQI
    indexes = data.get("indexes", [])
    for idx in indexes:
        code = idx.get("code", "")
        aqi_val = idx.get("aqi")
        category = idx.get("category", "")
        dominant = idx.get("dominantPollutant", "")
        color = idx.get("color", {})
        if aqi_val is not None:
            line = f"{code.upper()} AQI: {aqi_val} — {category}"
            if dominant:
                line += f" (dominant: {dominant})"
            lines.append(line)

    # Pollutant concentrations
    pollutants = data.get("pollutants", [])
    if pollutants:
        lines.append("\nPollutant concentrations:")
        for p in pollutants:
            display = p.get("displayName", p.get("code", ""))
            conc = p.get("concentration", {})
            value = conc.get("value")
            unit = conc.get("units", "")
            if value is not None:
                lines.append(f"  {display}: {value:.2f} {unit}")

    # Health recommendations
    recs = data.get("healthRecommendations", {})
    if recs:
        lines.append("\nHealth recommendations:")
        # Show general + at-risk groups
        general = recs.get("generalPopulation", "")
        if general:
            lines.append(f"  General: {general}")
        elderly = recs.get("elderly", "")
        if elderly:
            lines.append(f"  Elderly: {elderly}")
        lung = recs.get("lungDiseasePopulation", "")
        if lung:
            lines.append(f"  Lung conditions: {lung}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Shared geocoding helper for the new tools
# ---------------------------------------------------------------------------

async def _geocode_latlng(location_address: str, region_code: str = "US") -> tuple[float, float, str] | None:
    """Geocode an address to (lat, lng, formatted_address), or None if not found."""
    maps = MapsClient()
    geo_params = {"address": location_address, "key": maps.api_key, "region": region_code}
    geo_data = await maps._get(settings.maps_api_base_url_geocoding, geo_params)
    results = geo_data.get("results", [])
    if not results:
        return None
    loc = results[0]["geometry"]["location"]
    formatted = results[0].get("formatted_address", location_address)
    return loc["lat"], loc["lng"], formatted


# ---------------------------------------------------------------------------
# Distance Matrix (Routes API v2 — computeRouteMatrix)
# ---------------------------------------------------------------------------

async def get_distance_matrix(
    origins: list[str] | str,
    destinations: list[str] | str,
    travel_mode: str = "DRIVE",
) -> str:
    """Compute travel time and distance between multiple origins and destinations.

    Args:
        origins: One or more origin addresses (list of strings, or a single string).
        destinations: One or more destination addresses (list of strings, or a single string).
        travel_mode: Exact Routes API enum: DRIVE, WALK, BICYCLE, TRANSIT, TWO_WHEELER.
            Default "DRIVE".
    """
    if isinstance(origins, str):
        origins = [origins]
    if isinstance(destinations, str):
        destinations = [destinations]
    origins = [o for o in origins if o and o.strip()]
    destinations = [d for d in destinations if d and d.strip()]
    if not origins or not destinations:
        return "At least one origin and one destination are required."

    normalized_mode = _normalize_travel_mode(travel_mode)

    url = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MapsClient().api_key,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status,condition",
        "X-Goog-Maps-Solution-ID": _GMP_ATTRIBUTION,
    }
    payload: dict[str, Any] = {
        "origins": [{"waypoint": {"address": o}} for o in origins],
        "destinations": [{"waypoint": {"address": d}} for d in destinations],
        "travelMode": normalized_mode,
    }
    if normalized_mode == "TRANSIT":
        payload["departureTime"] = _now_rfc3339()

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
        data = resp.json()

    # computeRouteMatrix returns a JSON array of elements.
    elements = data if isinstance(data, list) else data.get("elements", [])
    if not elements:
        return "No route matrix results."

    lines = [f"Distance matrix ({normalized_mode}):"]
    for el in elements:
        o_idx = el.get("originIndex", 0)
        d_idx = el.get("destinationIndex", 0)
        origin = origins[o_idx] if o_idx < len(origins) else f"origin {o_idx}"
        dest = destinations[d_idx] if d_idx < len(destinations) else f"destination {d_idx}"
        condition = el.get("condition", "")
        if condition and condition != "ROUTE_EXISTS":
            lines.append(f"{origin} → {dest}: no route ({condition})")
            continue
        duration = el.get("duration", "")
        distance_m = el.get("distanceMeters", 0)
        distance_km = distance_m / 1000 if distance_m else 0
        lines.append(f"{origin} → {dest}: {distance_km:.1f} km, {duration}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Route with waypoints (Routes API v2 — intermediates)
# ---------------------------------------------------------------------------

async def compute_route_with_waypoints(
    origin_address: str,
    destination_address: str,
    waypoints: list[str] | None = None,
    travel_mode: str = "DRIVE",
) -> str:
    """Compute a multi-stop route through intermediate waypoints in order.

    Args:
        origin_address: Starting address (must be non-empty).
        destination_address: Ending address (must be non-empty).
        waypoints: Ordered list of intermediate stop addresses.
        travel_mode: Exact Routes API enum: DRIVE, WALK, BICYCLE, TRANSIT, TWO_WHEELER.
            Default "DRIVE".
    """
    if not origin_address or not origin_address.strip():
        raise ValueError("origin_address is required.")
    if not destination_address or not destination_address.strip():
        raise ValueError("destination_address is required.")

    normalized_mode = _normalize_travel_mode(travel_mode)
    waypoints = [w for w in (waypoints or []) if w and w.strip()]

    url = f"{settings.maps_api_base_url_routes}:computeRoutes"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MapsClient().api_key,
        "X-Goog-FieldMask": (
            "routes.duration,routes.distanceMeters,"
            "routes.legs.duration,routes.legs.distanceMeters"
        ),
        "X-Goog-Maps-Solution-ID": _GMP_ATTRIBUTION,
    }
    payload: dict[str, Any] = {
        "origin": {"address": origin_address},
        "destination": {"address": destination_address},
        "travelMode": normalized_mode,
        "computeAlternativeRoutes": False,
        "languageCode": "en-US",
        "units": "METRIC",
    }
    if waypoints:
        payload["intermediates"] = [{"address": w} for w in waypoints]
    if normalized_mode == "TRANSIT":
        payload["departureTime"] = _now_rfc3339()

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
        data = resp.json()

    routes = data.get("routes", [])
    if not routes:
        return "No route found."

    route = routes[0]
    total_distance_km = route.get("distanceMeters", 0) / 1000
    total_duration = route.get("duration", "")

    stops = [origin_address, *waypoints, destination_address]
    lines = [
        f"Multi-stop route ({normalized_mode}):",
        f"Stops: {' → '.join(stops)}",
        f"Total distance: {total_distance_km:.1f} km",
        f"Total duration: {total_duration}",
    ]

    legs = route.get("legs", [])
    if legs and len(legs) == len(stops) - 1:
        lines.append("Legs:")
        for i, leg in enumerate(legs):
            leg_km = leg.get("distanceMeters", 0) / 1000
            leg_dur = leg.get("duration", "")
            lines.append(f"  {stops[i]} → {stops[i + 1]}: {leg_km:.1f} km, {leg_dur}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Places Autocomplete (Places API — New)
# ---------------------------------------------------------------------------

async def autocomplete_place(input_text: str, region_code: str = "US") -> str:
    """Get place name/address autocomplete suggestions for a partial query.

    Args:
        input_text: Partial text the user typed, e.g. "eiffel" or "restaurants near lou".
        region_code: ISO 3166-1 alpha-2 country/region code to bias suggestions. Default "US".
    """
    if not input_text or not input_text.strip():
        return "input_text is required."

    url = f"{settings.maps_api_base_url_places}/places:autocomplete"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MapsClient().api_key,
        "X-Goog-Maps-Solution-ID": _GMP_ATTRIBUTION,
    }
    payload = {"input": input_text, "regionCode": region_code}

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
        data = resp.json()

    suggestions = data.get("suggestions", [])
    if not suggestions:
        return f"No suggestions for '{input_text}'."

    lines = [f"Suggestions for '{input_text}':"]
    for idx, s in enumerate(suggestions[:5], start=1):
        pred = s.get("placePrediction", {})
        text = pred.get("text", {}).get("text", "")
        place_id = pred.get("placeId", "")
        item = f"{idx}. {text}"
        if place_id:
            item += f"\n   Place ID: {place_id}"
        lines.append(item)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Static Map image (Maps Static API)
# ---------------------------------------------------------------------------

async def get_static_map_image(
    center_address: str,
    zoom: int = 13,
    markers: list[str] | None = None,
    size: str = "600x400",
) -> str:
    """Build a static map image URL centered on a location, with optional markers.

    Returns a publicly usable image URL that can be shown as an image in the UI.

    Args:
        center_address: Address or place name to center the map on.
        zoom: Map zoom level (1 world – 20 building). Default 13.
        markers: Optional list of addresses/places to drop pins on.
        size: Image size as "WIDTHxHEIGHT" in pixels. Default "600x400".
    """
    from urllib.parse import urlencode

    if not center_address or not center_address.strip():
        return "center_address is required."

    api_key = MapsClient().api_key
    params = [
        ("center", center_address),
        ("zoom", str(zoom)),
        ("size", size),
        ("scale", "2"),
        ("maptype", "roadmap"),
        ("key", api_key),
    ]
    for m in (markers or []):
        if m and m.strip():
            params.append(("markers", m))

    url = "https://maps.googleapis.com/maps/api/staticmap?" + urlencode(params)
    return (
        f"Static map for {center_address} (zoom {zoom}):\n"
        f"Image URL: {url}"
    )


# ---------------------------------------------------------------------------
# Pollen API
# ---------------------------------------------------------------------------

async def get_pollen(location_address: str, days: int = 3) -> str:
    """Get a pollen forecast (allergy index) for a location.

    Args:
        location_address: Address or city name to check pollen for.
        days: Number of forecast days, 1–5. Default 3.
    """
    geo = await _geocode_latlng(location_address)
    if geo is None:
        return f"Could not locate: {location_address}"
    lat, lng, formatted = geo

    url = "https://pollen.googleapis.com/v1/forecast:lookup"
    params = {
        "key": MapsClient().api_key,
        "location.latitude": lat,
        "location.longitude": lng,
        "days": max(1, min(days, 5)),
    }
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
        data = resp.json()

    daily = data.get("dailyInfo", [])
    if not daily:
        return f"No pollen data available for {formatted}."

    lines = [f"Pollen forecast for {formatted}:"]
    for day in daily:
        date = day.get("date", {})
        date_str = f"{date.get('year','')}-{date.get('month','')}-{date.get('day','')}"
        lines.append(f"\n{date_str}:")
        for p in day.get("pollenTypeInfo", []):
            name = p.get("displayName", p.get("code", ""))
            index = p.get("indexInfo", {})
            category = index.get("category", "")
            value = index.get("value")
            if value is not None:
                lines.append(f"  {name}: {value} ({category})")
            elif not p.get("inSeason", True):
                lines.append(f"  {name}: not in season")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Address Validation API
# ---------------------------------------------------------------------------

async def validate_address(address: str, region_code: str = "US") -> str:
    """Validate and standardize a postal address.

    Args:
        address: The address to validate, e.g. "1600 amphitheatre pkwy mountain view".
        region_code: ISO 3166-1 alpha-2 country/region code. Default "US".
    """
    if not address or not address.strip():
        return "address is required."

    url = "https://addressvalidation.googleapis.com/v1:validateAddress"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Maps-Solution-ID": _GMP_ATTRIBUTION,
    }
    payload = {
        "address": {
            "regionCode": region_code,
            "addressLines": [address],
        }
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            headers=headers,
            params={"key": MapsClient().api_key},
            json=payload,
        )
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise httpx.HTTPStatusError(
                f"{exc.response.status_code} {exc.response.reason_phrase}: {exc.response.text}",
                request=exc.request,
                response=exc.response,
            ) from exc
        data = resp.json()

    result = data.get("result", {})
    verdict = result.get("verdict", {})
    addr = result.get("address", {})
    formatted = addr.get("formattedAddress", "")

    complete = verdict.get("addressComplete", False)
    has_unconfirmed = verdict.get("hasUnconfirmedComponents", False)
    has_inferred = verdict.get("hasInferredComponents", False)

    lines = [f"Address validation for '{address}':"]
    if formatted:
        lines.append(f"Standardized: {formatted}")
    lines.append(f"Complete: {'Yes' if complete else 'No'}")
    if has_unconfirmed:
        lines.append("Warning: contains unconfirmed components.")
    if has_inferred:
        lines.append("Note: some components were inferred/added.")

    # Surface any missing or unconfirmed component types.
    unconfirmed = [
        c.get("componentType", "")
        for c in addr.get("addressComponents", [])
        if c.get("confirmationLevel") not in (None, "CONFIRMED")
    ]
    if unconfirmed:
        lines.append("Unconfirmed parts: " + ", ".join(t for t in unconfirmed if t))

    return "\n".join(lines)
