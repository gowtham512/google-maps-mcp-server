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