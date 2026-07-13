/**
 * customLibrary.ts
 *
 * Extends the default openuiLibrary with travel-specific card components.
 * The AI can use PlaceCard, RouteCard, ItineraryDayCard, and MapStaticCard
 * in its openui-lang output alongside all standard components.
 */

import * as React from "react"
import { defineComponent } from "@openuidev/react-lang"
import { openuiLibrary } from "@openuidev/react-ui/genui-lib"
import { z } from "zod"

import { PlaceCard } from "@/components/custom-cards/PlaceCard"
import { RouteCard } from "@/components/custom-cards/RouteCard"
import { ItineraryDayCard } from "@/components/custom-cards/ItineraryDayCard"
import { MapStaticCard } from "@/components/custom-cards/MapStaticCard"

// ---------------------------------------------------------------------------
// PlaceCard
// ---------------------------------------------------------------------------
export const PlaceCardComponent = defineComponent({
  name: "PlaceCard",
  description:
    "Displays a rich place card with photo, name, category badge, star rating, address, price level, and open/closed status. Use for hotels, restaurants, attractions, and any POI.",
  props: z.object({
    name: z.string().describe("Name of the place"),
    address: z.string().optional().describe("Formatted address"),
    rating: z.number().min(0).max(5).optional().describe("Rating from 0 to 5"),
    totalRatings: z.number().optional().describe("Total number of ratings"),
    priceLevel: z.number().min(1).max(4).optional().describe("Price level 1 to 4"),
    isOpen: z.boolean().optional().describe("true if open now, false if closed"),
    category: z.string().optional().describe("Place category e.g. Restaurant, Hotel, Museum"),
    photoUrl: z.string().optional().describe("URL of a hero photo"),
    mapsUrl: z.string().optional().describe("Google Maps URL"),
    phone: z.string().optional().describe("Phone number"),
    website: z.string().optional().describe("Website URL"),
  }),
  component: (props) =>
    React.createElement(PlaceCard, props),
})

// ---------------------------------------------------------------------------
// RouteCard
// ---------------------------------------------------------------------------
export const RouteCardComponent = defineComponent({
  name: "RouteCard",
  description:
    "Displays a route card with origin, destination, travel mode icon, duration, and distance. Optionally shows step-by-step directions.",
  props: z.object({
    origin: z.string().describe("Starting address or place name"),
    destination: z.string().describe("Ending address or place name"),
    travelMode: z
      .enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT", "TWO_WHEELER"])
      .optional()
      .describe("Travel mode — DRIVE, WALK, BICYCLE, TRANSIT, or TWO_WHEELER"),
    duration: z.string().optional().describe("Human-readable duration e.g. '1 hour 23 mins'"),
    distanceKm: z.number().optional().describe("Distance in kilometers"),
    steps: z
      .array(
        z.object({
          instruction: z.string(),
          distance: z.string().optional(),
          duration: z.string().optional(),
        })
      )
      .optional()
      .describe("Optional turn-by-turn directions"),
    polylineUrl: z.string().optional().describe("Static map image URL showing the route"),
  }),
  component: (props) =>
    React.createElement(RouteCard, props),
})

// ---------------------------------------------------------------------------
// ItineraryDayCard
// ---------------------------------------------------------------------------
const ItineraryStopSchema = z.object({
  time: z.string().optional().describe("Time e.g. '09:00 AM'"),
  name: z.string().describe("Place or activity name"),
  type: z
    .enum(["attraction", "restaurant", "hotel", "transport", "activity", "other"])
    .optional()
    .describe("Stop type — controls icon and colour"),
  duration: z.string().optional().describe("Time to spend e.g. '2 hours'"),
  description: z.string().optional().describe("Brief description or tips"),
  address: z.string().optional().describe("Address of the stop"),
})

export const ItineraryDayCardComponent = defineComponent({
  name: "ItineraryDayCard",
  description:
    "Displays a single day of a multi-day trip itinerary with a timeline of stops. Each stop has an icon by type, optional time, duration, and description.",
  props: z.object({
    day: z.number().describe("Day number in the trip starting from 1"),
    date: z.string().optional().describe("Formatted date e.g. 'Monday, Jul 14'"),
    title: z.string().optional().describe("Short title e.g. 'Arrival and City Tour'"),
    location: z.string().optional().describe("City or region for the day"),
    stops: z.array(ItineraryStopSchema).describe("Ordered list of stops for the day"),
    notes: z.string().optional().describe("Tips or notes for the day"),
  }),
  component: (props) =>
    React.createElement(ItineraryDayCard, props),
})

// ---------------------------------------------------------------------------
// MapStaticCard
// ---------------------------------------------------------------------------
const MapMarkerSchema = z.object({
  label: z.string().optional().describe("Single character label on pin e.g. 'A'"),
  lat: z.number().describe("Latitude"),
  lng: z.number().describe("Longitude"),
  color: z
    .enum(["red", "blue", "green", "yellow", "purple", "orange"])
    .optional()
    .describe("Marker pin colour"),
})

export const MapStaticCardComponent = defineComponent({
  name: "MapStaticCard",
  description:
    "Shows a Google Maps static image card with labelled markers. Falls back to a coordinate display with a Google Maps link when no API key is configured. Use to show a single location or a set of waypoints.",
  props: z.object({
    title: z.string().optional().describe("Card title in the header"),
    center: z
      .object({ lat: z.number(), lng: z.number() })
      .optional()
      .describe("Map center coordinates — auto-centers on first marker if omitted"),
    zoom: z.number().min(1).max(20).optional().describe("Zoom level 1–20 (default 13)"),
    markers: z.array(MapMarkerSchema).optional().describe("Array of map markers"),
    mapType: z
      .enum(["roadmap", "satellite", "terrain", "hybrid"])
      .optional()
      .describe("Map style (default roadmap)"),
  }),
  component: (props) =>
    React.createElement(MapStaticCard, props),
})

// ---------------------------------------------------------------------------
// Travel component group definition
// ---------------------------------------------------------------------------
const travelComponentGroup = {
  name: "Travel Cards",
  description: "Rich card components for travel planning data — use for places, routes, itineraries, and maps.",
  components: ["PlaceCard", "RouteCard", "ItineraryDayCard", "MapStaticCard"] as string[],
  notes: [
    "- Use PlaceCard for hotels, restaurants, attractions, and any point of interest from search results.",
    "- Use RouteCard whenever you call compute_route — populate duration and distanceKm from the tool result.",
    "- Use ItineraryDayCard for multi-day trip plans — one card per day, stops ordered chronologically.",
    "- Use MapStaticCard with lat/lng coordinates from geocode_address or search_places results.",
    '- Wrap multiple PlaceCards in Stack([card1, card2, ...], "row", "m", "start", "start", true) for a grid.',
    "- ItineraryDayCard stop types: attraction, restaurant, hotel, transport, activity, other.",
  ],
}

// ---------------------------------------------------------------------------
// Merged library — inject custom components directly into openuiLibrary.
//
// We do NOT call createLibrary() here. That would reconstruct the library
// from scratch and risk losing the React rendering functions attached to the
// built-in components. Instead we spread the existing openuiLibrary and add
// only the 4 new component entries to its components map.
//
// Built-ins (Stack, Card, Table, BarChart, Tabs, Form…) stay exactly as-is.
// ---------------------------------------------------------------------------
export const mergedTravelLibrary = {
  ...openuiLibrary,
  components: {
    ...openuiLibrary.components,
    PlaceCard: PlaceCardComponent,
    RouteCard: RouteCardComponent,
    ItineraryDayCard: ItineraryDayCardComponent,
    MapStaticCard: MapStaticCardComponent,
  },
  componentGroups: [
    ...(openuiLibrary.componentGroups ?? []),
    travelComponentGroup,
  ],
}
