export function createToolProvider() {
  return {
    geocode_address: async (args: any) => toolFetch("geocode_address", args),
    reverse_geocode: async (args: any) => toolFetch("reverse_geocode", args),
    validate_address: async (args: any) => toolFetch("validate_address", args),
    get_timezone: async (args: any) => toolFetch("get_timezone", args),
    search_places: async (args: any) => toolFetch("search_places", args),
    get_place_details: async (args: any) => toolFetch("get_place_details", args),
    get_route: async (args: any) => toolFetch("get_route", args),
    get_distance_matrix: async (args: any) => toolFetch("get_distance_matrix", args),
    get_map_image: async (args: any) => toolFetch("get_map_image", args),
    suggest_itinerary: async (args: any) => toolFetch("suggest_itinerary", args),
  };
}

async function toolFetch(name: string, args: any) {
  const res = await fetch(`/api/tools/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tool ${name} failed: ${text}`);
  }
  return res.json();
}
