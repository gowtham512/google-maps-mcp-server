import { z } from "zod";
import {
  geocodeAddress,
  reverseGeocode,
  validateAddress,
  getTimezone,
  searchPlaces,
  getPlaceDetails,
  getRoute,
  getDistanceMatrix,
  getMapImage,
  suggestItinerary,
} from "./google-maps";

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any, any>;
  execute: (args: any) => Promise<any>;
};

export const tools: ToolDef[] = [
  {
    name: "geocode_address",
    description: "Convert a street address or place name into latitude/longitude.",
    inputSchema: z.object({ address: z.string().describe("Address or place name") }),
    execute: ({ address }) => geocodeAddress(address),
  },
  {
    name: "reverse_geocode",
    description: "Convert latitude/longitude into a human-readable address.",
    inputSchema: z.object({
      latitude: z.number().describe("Latitude"),
      longitude: z.number().describe("Longitude"),
    }),
    execute: ({ latitude, longitude }) => reverseGeocode(latitude, longitude),
  },
  {
    name: "validate_address",
    description: "Validate and standardize a postal address.",
    inputSchema: z.object({ address: z.string().describe("Address to validate") }),
    execute: ({ address }) => validateAddress(address),
  },
  {
    name: "get_timezone",
    description: "Get the time zone for a location.",
    inputSchema: z.object({
      latitude: z.number().describe("Latitude"),
      longitude: z.number().describe("Longitude"),
    }),
    execute: ({ latitude, longitude }) => getTimezone(latitude, longitude),
  },
  {
    name: "search_places",
    description: "Find places near a location. Location can be an address or 'lat,lng'.",
    inputSchema: z.object({
      location: z.string().describe("Address or 'lat,lng'"),
      radius_meters: z.number().default(1500).describe("Search radius in meters"),
      place_type: z.string().default("restaurant").describe("Place type, e.g. restaurant, tourist_attraction"),
      max_results: z.number().default(5).describe("Maximum number of results"),
    }),
    execute: ({ location, radius_meters, place_type, max_results }) =>
      searchPlaces(location, radius_meters, place_type, max_results),
  },
  {
    name: "get_place_details",
    description: "Fetch detailed information about a specific place.",
    inputSchema: z.object({ place_id: z.string().describe("Google Place ID") }),
    execute: ({ place_id }) => getPlaceDetails(place_id),
  },
  {
    name: "get_route",
    description: "Get directions between two places. Locations can be addresses or 'lat,lng'.",
    inputSchema: z.object({
      origin: z.string().describe("Origin address or 'lat,lng'"),
      destination: z.string().describe("Destination address or 'lat,lng'"),
      travel_mode: z.enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"]).default("DRIVE").describe("Travel mode"),
    }),
    execute: ({ origin, destination, travel_mode }) => getRoute(origin, destination, travel_mode),
  },
  {
    name: "get_distance_matrix",
    description: "Get travel distances and durations between many origins and destinations.",
    inputSchema: z.object({
      origins: z.array(z.string()).describe("List of addresses or 'lat,lng' strings"),
      destinations: z.array(z.string()).describe("List of addresses or 'lat,lng' strings"),
      travel_mode: z.enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"]).default("DRIVE").describe("Travel mode"),
    }),
    execute: ({ origins, destinations, travel_mode }) =>
      getDistanceMatrix(origins, destinations, travel_mode),
  },
  {
    name: "get_map_image",
    description: "Generate a URL for a static map image of a location.",
    inputSchema: z.object({
      center: z.string().describe("Center address or 'lat,lng'"),
      zoom: z.number().default(14).describe("Zoom level"),
      width: z.number().default(600).describe("Image width"),
      height: z.number().default(400).describe("Image height"),
      markers: z.array(z.string()).optional().describe("Marker strings"),
    }),
    execute: ({ center, zoom, width, height, markers }) =>
      getMapImage(center, zoom, width, height, markers),
  },
  {
    name: "suggest_itinerary",
    description: "Build a simple day-by-day itinerary of places and routes in a destination.",
    inputSchema: z.object({
      destination: z.string().describe("Destination city or place"),
      interests: z.array(z.string()).default(["tourist_attraction"]).describe("List of interests for each day"),
      days: z.number().default(1).describe("Number of days"),
    }),
    execute: ({ destination, interests, days }) => suggestItinerary(destination, interests, days),
  },
];

export const toolMap = new Map(tools.map((t) => [t.name, t]));
