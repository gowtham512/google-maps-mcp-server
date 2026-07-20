/**
 * travelLibrary.ts
 *
 * The canonical OpenUI library for the Travel Planner app.
 *
 * Exports:
 *   - `library`       — the built-in OpenUI component library PLUS our custom
 *                       travel components (all built-ins are kept, not replaced)
 *   - `promptOptions` — preamble, rules, and examples for prompt generation
 *
 * The @openuidev/cli reads this file to generate the system prompt:
 *   npm run generate-prompt   (from apps/web/)
 *
 * The CLI bundles this file with esbuild so React/TSX imports work fine.
 */

import { createLibrary, type PromptOptions } from "@openuidev/react-lang"
import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui/genui-lib"

import { travelComponents } from "./travelComponents"

// ---------------------------------------------------------------------------
// Library — ALL built-in OpenUI components + our custom travel components
// ---------------------------------------------------------------------------
export const library = createLibrary({
  root: "Stack",
  components: [
    // All built-in OpenUI components (Stack, Card, Table, BarChart, Tabs, Form, etc.)
    ...Object.values(openuiLibrary.components),
    // Custom travel components (WeatherCard, PlaceCard, ItineraryDay, ...)
    ...travelComponents,
  ],
  componentGroups: [
    // All built-in groups (Layout, Content, Charts, Forms, etc.)
    ...(openuiLibrary.componentGroups ?? []),
  ],
})

// ---------------------------------------------------------------------------
// Prompt options — built-in preamble/rules/examples + travel component guidance
// ---------------------------------------------------------------------------
export const promptOptions: PromptOptions = {
  preamble:
    "You are an AI assistant that responds using openui-lang, a declarative UI language. " +
    "Your ENTIRE response must be valid openui-lang code — no markdown, no explanations, just openui-lang. " +
    "root = Stack(...) must be the first line of every response.",

  additionalRules: [
    // Built-in rules
    ...(openuiPromptOptions.additionalRules ?? []),
    // Custom travel component rules
    "Prefer the custom travel components over generic Card/TextContent when the content fits them:",
    "- Use WeatherCard for weather from get_weather (location, temperature, condition, and optional high/low/icon).",
    "- Use PlaceCard for a single place from search_places/get_place_details; put its photo URL in imageUrl and rating/category/address when known.",
    "- Use ItineraryDay for each day of a multi-day trip: a title like 'Day 1: A → B' and items as the ordered list of stops/activities.",
    "- Use RouteSummary for a computed route: origin, destination, and optional distance/duration/mode.",
    "- Use TravelTip for advisories, best-time-to-visit, safety, or packing notes; set variant to info | tip | warning | success.",
    "- Use PhotoStrip to show several photo URLs of a place.",
    "Compose multiple cards vertically in the root Stack. For wide layouts, nest Stacks with direction 'row' and wrap=true so cards flow responsively.",
  ],

  examples: [
    // Built-in examples
    ...(openuiPromptOptions.examples ?? []),
    // Weather answer
    'root = Stack([w])\nw = WeatherCard("Pune, India", "28°C", "Partly cloudy", "31°C", "22°C", "⛅")',
    // Multi-day itinerary
    'root = Stack([intro, d1, d2])\n' +
      'intro = TextContent("A 2-day Pune getaway", "large-heavy")\n' +
      'd1 = ItineraryDay("Day 1: Pune → Lonavala", ["Visit Tiger Point", "Explore Karla Caves", "Sunset at Bhushi Dam"], "Scenic hill drive")\n' +
      'd2 = ItineraryDay("Day 2: Lonavala → Pune", ["Della Adventure Park", "Return drive to Pune"])',
    // Place with route + tip
    'root = Stack([p, r, tip])\n' +
      'p = PlaceCard("Shaniwar Wada", "Historic fortification in the heart of Pune.", null, "4.3", "Historical landmark", "Shaniwar Peth, Pune")\n' +
      'r = RouteSummary("Pune", "Lonavala", "64 km", "1 hr 30 min", "Drive")\n' +
      'tip = TravelTip("Best time to visit", "October to March offers the most pleasant weather.", "tip")',
  ],
}
