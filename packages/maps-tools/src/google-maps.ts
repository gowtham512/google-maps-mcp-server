const API_KEY = process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";

if (!API_KEY) {
  throw new Error("GOOGLE_MAPS_API_KEY environment variable is required");
}

const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const ADDRESS_VALIDATION_URL = "https://addressvalidation.googleapis.com/v1:validateAddress";
const TIMEZONE_URL = "https://maps.googleapis.com/maps/api/timezone/json";
const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";
const PLACES_URL = "https://places.googleapis.com/v1/places";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const DISTANCE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

export function parseLatLng(input: string): { latitude: number; longitude: number } | null {
  const parts = input.replace(/\s/g, "").split(",");
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { latitude: lat, longitude: lng };
}

export async function geocodeAddress(address: string) {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("key", API_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = (await res.json()) as any;
  const result = data.results?.[0];
  if (!result) return { found: false, address, error: data.status };
  const loc = result.geometry.location;
  return {
    found: true,
    address: result.formatted_address,
    latitude: loc.lat,
    longitude: loc.lng,
    place_id: result.place_id,
  };
}

export async function reverseGeocode(latitude: number, longitude: number) {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set("latlng", `${latitude},${longitude}`);
  url.searchParams.set("key", API_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Reverse geocoding failed: ${res.status}`);
  const data = (await res.json()) as any;
  const result = data.results?.[0];
  if (!result) return { found: false, error: data.status };
  return {
    found: true,
    address: result.formatted_address,
    place_id: result.place_id,
    types: result.types ?? [],
  };
}

export async function validateAddress(address: string) {
  const res = await fetch(`${ADDRESS_VALIDATION_URL}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: { addressLines: [address] } }),
  });
  if (!res.ok) throw new Error(`Address validation failed: ${res.status}`);
  const data = (await res.json()) as any;
  const verdict = data.result?.verdict ?? {};
  const addressResult = data.result?.address ?? {};
  return {
    valid: verdict.addressComplete ?? false,
    normalized_address: addressResult.formattedAddress,
    has_unconfirmed_components: verdict.hasUnconfirmedComponents ?? false,
    has_inferred_components: verdict.hasInferredComponents ?? false,
    granularity: addressResult.addressResolutionResult ?? "UNKNOWN",
  };
}

export async function getTimezone(latitude: number, longitude: number) {
  const url = new URL(TIMEZONE_URL);
  url.searchParams.set("location", `${latitude},${longitude}`);
  url.searchParams.set("timestamp", "0");
  url.searchParams.set("key", API_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Timezone failed: ${res.status}`);
  const data = (await res.json()) as any;
  return {
    time_zone_id: data.timeZoneId,
    time_zone_name: data.timeZoneName,
    raw_offset: data.rawOffset,
    dst_offset: data.dstOffset,
  };
}

export async function searchPlaces(
  location: string,
  radiusMeters: number,
  placeType: string,
  maxResults: number,
) {
  let point = parseLatLng(location);
  if (!point) {
    const geo = await geocodeAddress(location);
    if (!geo.found) return { found: false, error: `Could not geocode: ${location}` };
    point = { latitude: geo.latitude, longitude: geo.longitude };
  }

  const body = {
    locationRestriction: {
      circle: {
        center: { latitude: point.latitude, longitude: point.longitude },
        radius: radiusMeters,
      },
    },
    includedTypes: [placeType],
    maxResultCount: maxResults,
  };

  const res = await fetch(`${PLACES_URL}:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.primaryType,places.internationalPhoneNumber,places.websiteUri",
      "X-Goog-Api-Key": API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Places search failed: ${res.status}`);
  const data = (await res.json()) as any;
  const places = (data.places ?? []).map((p: any) => ({
    place_id: p.id,
    name: p.displayName?.text,
    address: p.formattedAddress,
    latitude: p.location?.latitude,
    longitude: p.location?.longitude,
    rating: p.rating,
    type: p.primaryType,
    phone: p.internationalPhoneNumber,
    website: p.websiteUri,
  }));
  return { found: places.length > 0, location: point, places };
}

export async function getPlaceDetails(placeId: string) {
  const res = await fetch(`${PLACES_URL}/${placeId}`, {
    headers: {
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location,rating,primaryType,internationalPhoneNumber,websiteUri,regularOpeningHours,editorialSummary,photos",
      "X-Goog-Api-Key": API_KEY,
    },
  });
  if (!res.ok) throw new Error(`Place details failed: ${res.status}`);
  const p = (await res.json()) as any;
  return {
    place_id: p.id,
    name: p.displayName?.text,
    address: p.formattedAddress,
    latitude: p.location?.latitude,
    longitude: p.location?.longitude,
    rating: p.rating,
    type: p.primaryType,
    phone: p.internationalPhoneNumber,
    website: p.websiteUri,
    summary: p.editorialSummary?.text,
    open_now: p.regularOpeningHours?.openNow,
    photo_count: p.photos?.length ?? 0,
  };
}

function placePoint(loc: string) {
  const point = parseLatLng(loc);
  if (point) {
    return { location: { latLng: { latitude: point.latitude, longitude: point.longitude } } };
  }
  return { address: loc };
}

function waypoints(locations: string[]) {
  return locations.map((loc) => {
    const point = parseLatLng(loc);
    if (point) {
      return { latLng: { latitude: point.latitude, longitude: point.longitude } };
    }
    return { address: loc };
  });
}

export async function getRoute(origin: string, destination: string, travelMode = "DRIVE") {
  const body = {
    origin: placePoint(origin),
    destination: placePoint(destination),
    travelMode,
    routingPreference: "TRAFFIC_AWARE",
    computeAlternativeRoutes: false,
    units: "METRIC",
  };
  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.legs",
      "X-Goog-Api-Key": API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Route failed: ${res.status}`);
  const data = (await res.json()) as any;
  const route = data.routes?.[0];
  if (!route) return { found: false, origin, destination };
  const leg = route.legs[0];
  const steps = (leg.steps ?? []).map((s: any) => ({
    instruction: s.navigationInstruction?.instructions ?? "",
    distance_meters: s.distanceMeters,
  }));
  return {
    found: true,
    origin: leg.startLocation,
    destination: leg.endLocation,
    distance_meters: route.distanceMeters,
    duration: route.duration,
    steps: steps.slice(0, 20),
  };
}

export async function getDistanceMatrix(
  origins: string[],
  destinations: string[],
  travelMode = "DRIVE",
) {
  const body = {
    origins: waypoints(origins),
    destinations: waypoints(destinations),
    travelMode,
    routingPreference: "TRAFFIC_AWARE",
    units: "METRIC",
  };
  const res = await fetch(DISTANCE_MATRIX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
      "X-Goog-Api-Key": API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Distance matrix failed: ${res.status}`);
  const data = (await res.json()) as any;
  const rows = data.map((row: any) => ({
    from: origins[row.originIndex ?? 0],
    to: destinations[row.destinationIndex ?? 0],
    distance_meters: row.distanceMeters,
    duration: row.duration,
    condition: row.condition,
  }));
  return { rows };
}

export async function getMapImage(
  center: string,
  zoom = 14,
  width = 600,
  height = 400,
  markers?: string[],
) {
  const params = new URLSearchParams();
  params.set("center", center);
  params.set("zoom", zoom.toString());
  params.set("size", `${width}x${height}`);
  params.set("key", API_KEY);
  if (markers) {
    markers.forEach((m) => params.append("markers", m));
  }
  const url = `${STATIC_MAP_URL}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Map image failed: ${res.status}`);
  return {
    map_image_url: res.url,
    width,
    height,
  };
}

export async function suggestItinerary(
  destination: string,
  interests: string[],
  days = 1,
) {
  const geo = await geocodeAddress(destination);
  if (!geo.found) return { error: `Could not locate destination: ${destination}` };

  const center = `${geo.latitude},${geo.longitude}`;
  const result: Record<string, any> = {
    destination: geo.address,
    center: { latitude: geo.latitude, longitude: geo.longitude },
    days: [],
  };

  for (let day = 1; day <= days; day++) {
    const interest = interests.length ? interests[(day - 1) % interests.length] : "tourist_attraction";
    const search = await searchPlaces(center, 5000, interest, 3);
    const stops = search.places ?? [];
    let routeSummary = null;
    if (stops.length >= 2) {
      const route = await getRoute(stops[0].address, stops[stops.length - 1].address);
      routeSummary = {
        distance_meters: route.distance_meters,
        duration: route.duration,
      };
    }
    result.days.push({
      day,
      theme: interest,
      stops,
      route_summary: routeSummary,
    });
  }

  return result;
}
