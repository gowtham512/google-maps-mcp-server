/**
 * travelLibrary.ts
 *
 * The canonical OpenUI library for the Travel Planner app.
 *
 * Exports:
 *   - `library`       — merged Library (all built-ins + 4 custom travel cards)
 *   - `promptOptions` — preamble, rules, and examples for prompt generation
 *
 * The @openuidev/cli reads this file to generate the system prompt:
 *   npx @openuidev/cli generate ./src/lib/travelLibrary.ts --out ../../backend/openui_system_prompt.txt
 *
 * The CLI bundles this file with esbuild so React/TSX imports work fine.
 */

import * as React from "react"
import { defineComponent, createLibrary, type PromptOptions } from "@openuidev/react-lang"
import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui/genui-lib"
import { z } from "zod"

import { PlaceCard } from "../components/custom-cards/PlaceCard"
import { RouteCard } from "../components/custom-cards/RouteCard"
import { ItineraryDayCard } from "../components/custom-cards/ItineraryDayCard"
import { MapStaticCard } from "../components/custom-cards/MapStaticCard"

// ---------------------------------------------------------------------------
// Custom travel card components
// ---------------------------------------------------------------------------

const PlaceCardComponent = defineComponent({
  name: "PlaceCard",
  description:
    "Rich place card with hero photo, name, category badge, star rating, open/closed status, price level, address, and links. Use for every hotel, restaurant, attraction, or POI from search results.",
  props: z.object({
    name: z.string().describe("Name of the place"),
    address: z.string().optional().describe("Formatted address"),
    rating: z.number().min(0).max(5).optional().describe("Rating 0–5"),
    totalRatings: z.number().optional().describe("Total number of ratings"),
    priceLevel: z.number().min(1).max(4).optional().describe("Price level 1–4 ($ to $$$$)"),
    isOpen: z.boolean().optional().describe("true = open now, false = closed"),
    category: z.string().optional().describe("Category e.g. Restaurant, Hotel, Museum"),
    photoUrl: z.string().optional().describe("Hero photo URL — use from get_place_details"),
    mapsUrl: z.string().optional().describe("Google Maps URL"),
    phone: z.string().optional().describe("Phone number"),
    website: z.string().optional().describe("Website URL"),
  }),
  component: ({ props }) => React.createElement(PlaceCard, props),
})

const RouteCardComponent = defineComponent({
  name: "RouteCard",
  description:
    "Route card with origin→destination display, travel mode icon, duration, and distance. Optionally shows collapsible step-by-step directions. Use whenever compute_route is called.",
  props: z.object({
    origin: z.string().describe("Starting address or place name"),
    destination: z.string().describe("Ending address or place name"),
    travelMode: z
      .enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT", "TWO_WHEELER"])
      .optional()
      .describe("Travel mode — DRIVE, WALK, BICYCLE, TRANSIT, or TWO_WHEELER"),
    duration: z.string().optional().describe("Human-readable duration e.g. '1 hour 23 mins'"),
    distanceKm: z.number().optional().describe("Distance in kilometres"),
    steps: z
      .array(z.object({
        instruction: z.string(),
        distance: z.string().optional(),
        duration: z.string().optional(),
      }))
      .optional()
      .describe("Optional turn-by-turn directions"),
    polylineUrl: z.string().optional().describe("Static map image URL showing the route"),
  }),
  component: ({ props }) => React.createElement(RouteCard, props),
})

const ItineraryDayCardComponent = defineComponent({
  name: "ItineraryDayCard",
  description:
    "Single day of a multi-day trip itinerary with a timeline of stops. Each stop has a type-based icon, optional time, duration, and description. Use one card per day; wrap multiple in a column Stack.",
  props: z.object({
    day: z.number().describe("Day number starting from 1"),
    date: z.string().optional().describe("Formatted date e.g. 'Monday, Jul 14'"),
    title: z.string().optional().describe("Short day title e.g. 'Arrival and City Tour'"),
    location: z.string().optional().describe("City or region for the day"),
    stops: z.array(z.object({
      time: z.string().optional().describe("Time e.g. '09:00 AM'"),
      name: z.string().describe("Place or activity name"),
      type: z
        .enum(["attraction", "restaurant", "hotel", "transport", "activity", "other"])
        .optional()
        .describe("Stop type — controls icon and colour"),
      duration: z.string().optional().describe("Time to spend e.g. '2 hours'"),
      description: z.string().optional().describe("Brief description or tips"),
      address: z.string().optional().describe("Address"),
    })).describe("Ordered stops for the day"),
    notes: z.string().optional().describe("Tips or notes for the day"),
  }),
  component: ({ props }) => React.createElement(ItineraryDayCard, props),
})

const MapStaticCardComponent = defineComponent({
  name: "MapStaticCard",
  description:
    "Google Maps static image card with labelled pins. Falls back to a Google Maps link when no API key is configured. Use lat/lng from geocode_address or search_places results.",
  props: z.object({
    title: z.string().optional().describe("Card header title"),
    center: z
      .object({ lat: z.number(), lng: z.number() })
      .optional()
      .describe("Map centre — auto-centres on first marker if omitted"),
    zoom: z.number().min(1).max(20).optional().describe("Zoom level 1–20 (default 13)"),
    markers: z
      .array(z.object({
        label: z.string().optional().describe("Single-char pin label e.g. 'A'"),
        lat: z.number().describe("Latitude"),
        lng: z.number().describe("Longitude"),
        color: z
          .enum(["red", "blue", "green", "yellow", "purple", "orange"])
          .optional()
          .describe("Pin colour"),
      }))
      .optional()
      .describe("Array of map markers"),
    mapType: z
      .enum(["roadmap", "satellite", "terrain", "hybrid"])
      .optional()
      .describe("Map style (default roadmap)"),
  }),
  component: ({ props }) => React.createElement(MapStaticCard, props),
})

// ---------------------------------------------------------------------------
// Travel card component group
// ---------------------------------------------------------------------------
const travelComponentGroup = {
  name: "Travel Cards",
  components: ["PlaceCard", "RouteCard", "ItineraryDayCard", "MapStaticCard"],
  notes: [
    "- ALWAYS prefer Travel Cards over generic Cards for travel data.",
    "- Use PlaceCard for every POI from search_places, find_nearby_places, or get_place_details.",
    "- Use RouteCard for every compute_route result — always set origin, destination, travelMode, duration, distanceKm.",
    "- Use ItineraryDayCard for multi-day trips — one card per day with stops in chronological order.",
    "- Use MapStaticCard whenever you have lat/lng coordinates from any tool result.",
    '- Grid of PlaceCards: Stack([p1, p2, p3], "row", "m", "start", "start", true)',
    "- Multiple days: Stack([day1, day2, day3], \"column\", \"m\")",
    "- ItineraryDayCard stop types: attraction, restaurant, hotel, transport, activity, other.",
  ],
}

// ---------------------------------------------------------------------------
// Merged library — all built-ins + 4 custom travel cards in one createLibrary
// ---------------------------------------------------------------------------
export const library = createLibrary({
  root: "Stack",
  components: [
    // All built-in OpenUI components (Stack, Card, Table, BarChart, Tabs, Form, etc.)
    ...Object.values(openuiLibrary.components),
    // Custom travel cards
    PlaceCardComponent,
    RouteCardComponent,
    ItineraryDayCardComponent,
    MapStaticCardComponent,
  ],
  componentGroups: [
    // All built-in groups (Layout, Content, Charts, Forms, etc.)
    ...(openuiLibrary.componentGroups ?? []),
    // Travel Cards group
    travelComponentGroup,
  ],
})

// ---------------------------------------------------------------------------
// Prompt options — merged with built-in examples + travel-specific additions
// ---------------------------------------------------------------------------
export const promptOptions: PromptOptions = {
  preamble:
    "You are an AI assistant that responds using openui-lang, a declarative UI language. " +
    "Your ENTIRE response must be valid openui-lang code — no markdown, no explanations, just openui-lang. " +
    "root = Stack(...) must be the first line of every response.",

  additionalRules: [
    // Spread all built-in rules first
    ...(openuiPromptOptions.additionalRules ?? []),
    // Travel-specific rules
    "ALWAYS prefer Travel Card components (PlaceCard, RouteCard, ItineraryDayCard, MapStaticCard) over generic Cards when rendering travel data.",
    "Use PlaceCard for every hotel, restaurant, attraction, or POI returned by search_places or find_nearby_places.",
    "Use RouteCard for every compute_route result — always populate origin, destination, travelMode, duration, and distanceKm.",
    "Use ItineraryDayCard for multi-day trip plans — one card per day, stops in chronological order.",
    "Use MapStaticCard when you have lat/lng coordinates from geocode_address or search_places — set center and markers.",
    'Wrap multiple PlaceCards in a row Stack: Stack([p1, p2, p3], "row", "m", "start", "start", true)',
    "Stack multiple ItineraryDayCards in a column Stack with gap m.",
  ],

  examples: [
    // Built-in examples
    ...(openuiPromptOptions.examples ?? []),
    // Travel card examples
    `Example — Place search results as a grid of PlaceCards:

root = Stack([heading, grid])
heading = TextContent("Top Restaurants in Paris", "large-heavy")
grid = Stack([p1, p2, p3], "row", "m", "start", "start", true)
p1 = PlaceCard("Le Jules Verne", "Eiffel Tower, Paris", 4.6, 3200, 4, true, "Restaurant")
p2 = PlaceCard("Café de Flore", "172 Bd Saint-Germain, Paris", 4.3, 8700, 3, true, "Café")
p3 = PlaceCard("L'Ambroisie", "9 Pl. des Vosges, Paris", 4.8, 1200, 4, true, "Fine Dining")`,

    `Example — Route result as a RouteCard:

root = Stack([heading, route])
heading = TextContent("Your Route", "large-heavy")
route = RouteCard("CDG Airport, Paris", "Eiffel Tower, Paris", "DRIVE", "45 mins", 32.5)`,

    `Example — Multi-day itinerary with ItineraryDayCard:

root = Stack([heading, day1, day2], "column", "m")
heading = TextContent("3-Day Paris Itinerary", "large-heavy")
day1 = ItineraryDayCard(1, "Monday, Jul 14", "Arrival and Highlights", "Paris", [s1, s2, s3])
s1 = {time: "10:00 AM", name: "Eiffel Tower", type: "attraction", duration: "2 hours"}
s2 = {time: "01:00 PM", name: "Café de Flore", type: "restaurant", duration: "1 hour"}
s3 = {time: "03:00 PM", name: "Louvre Museum", type: "attraction", duration: "3 hours"}
day2 = ItineraryDayCard(2, "Tuesday, Jul 15", "Art and Culture", "Paris", [s4, s5])
s4 = {time: "09:00 AM", name: "Musée d'Orsay", type: "attraction", duration: "2 hours"}
s5 = {time: "12:30 PM", name: "Angelina Paris", type: "restaurant", duration: "1 hour"}`,

    `Example — Map with markers from geocoded results:

root = Stack([heading, map])
heading = TextContent("Paris Highlights Map", "large-heavy")
map = MapStaticCard("Key Locations", {lat: 48.8566, lng: 2.3522}, 13, [{lat: 48.8584, lng: 2.2945, label: "A", color: "red"}, {lat: 48.8606, lng: 2.3376, label: "B", color: "blue"}])`,
  ],
}
