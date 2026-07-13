/**
 * generate-prompt.mjs
 *
 * Generates the OpenUI system prompt for the travel agent backend.
 *
 * Strategy:
 *   1. Start with openuiLibrary.prompt(openuiPromptOptions) — this produces the
 *      full 20k-char prompt with ALL built-in component signatures (Stack, Card,
 *      Table, BarChart, Tabs, Form, Steps etc.).
 *   2. Inject our 4 custom travel card signatures into the Component Signatures
 *      section by appending a "### Travel Cards" block.
 *   3. Append our travel-specific rules and examples.
 *   4. Prepend our travel agent preamble (replaces the generic openui preamble).
 *
 * Run from apps/web/:
 *   node scripts/generate-prompt.mjs
 *   npm run generate-prompt
 */

import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui/genui-lib"
import { writeFileSync, mkdirSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, "../../backend/openui_system_prompt.txt")

// ---------------------------------------------------------------------------
// Step 1 — Generate the full built-in prompt (all signatures included)
// ---------------------------------------------------------------------------
const builtinPrompt = openuiLibrary.prompt(openuiPromptOptions)

// ---------------------------------------------------------------------------
// Step 2 — Custom travel card signatures block to inject
// ---------------------------------------------------------------------------
const travelCardsSection = `
### Travel Cards
PlaceCard(name: string, address?: string, rating?: number, totalRatings?: number, priceLevel?: number, isOpen?: boolean, category?: string, photoUrl?: string, mapsUrl?: string, phone?: string, website?: string) — Rich place card with hero photo, name, category badge, star rating, open/closed status, price level ($–$$$$), address, and links. Use for every hotel, restaurant, attraction, or POI from search results.
RouteCard(origin: string, destination: string, travelMode?: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT" | "TWO_WHEELER", duration?: string, distanceKm?: number, steps?: {instruction: string, distance?: string, duration?: string}[], polylineUrl?: string) — Route card with origin→destination display, travel mode icon, duration, and distance. Optionally shows collapsible step-by-step directions. Use whenever compute_route is called.
ItineraryDayCard(day: number, date?: string, title?: string, location?: string, stops: {time?: string, name: string, type?: "attraction" | "restaurant" | "hotel" | "transport" | "activity" | "other", duration?: string, description?: string, address?: string}[], notes?: string) — Single day of a multi-day trip itinerary with a timeline of stops. Each stop has a type-based icon, optional time, duration, and description. Use one card per day; wrap multiple in a column Stack.
MapStaticCard(title?: string, center?: {lat: number, lng: number}, zoom?: number, markers?: {label?: string, lat: number, lng: number, color?: "red" | "blue" | "green" | "yellow" | "purple" | "orange"}[], mapType?: "roadmap" | "satellite" | "terrain" | "hybrid") — Google Maps static image card with labelled pins. Falls back to a clickable Google Maps link when no API key is set. Use lat/lng from geocode_address or search_places results.
- Use PlaceCard for every POI from search_places or find_nearby_places — never use a plain Card for place data.
- Use RouteCard for every compute_route result — populate origin, destination, travelMode, duration, distanceKm.
- Use ItineraryDayCard for multi-day plans — one card per day with stops in chronological order.
- Use MapStaticCard whenever you have lat/lng coordinates from any tool result.
- Multiple PlaceCards grid: Stack([p1, p2, p3], "row", "m", "start", "start", true)
- Multiple ItineraryDayCards: Stack([day1, day2, day3], "column", "m")`

// ---------------------------------------------------------------------------
// Step 3 — Inject the Travel Cards section just before "## Hoisting"
//          (which comes after the last built-in component group)
// ---------------------------------------------------------------------------
const INJECT_BEFORE = "## Hoisting"
const injectIdx = builtinPrompt.indexOf(INJECT_BEFORE)

let promptWithTravelCards
if (injectIdx !== -1) {
  promptWithTravelCards =
    builtinPrompt.slice(0, injectIdx).trimEnd() +
    "\n" + travelCardsSection + "\n\n" +
    builtinPrompt.slice(injectIdx)
} else {
  // Fallback: just append
  promptWithTravelCards = builtinPrompt + "\n" + travelCardsSection
}

// ---------------------------------------------------------------------------
// Step 4 — Replace the generic preamble with our travel agent preamble
// ---------------------------------------------------------------------------
const GENERIC_PREAMBLE = "You are an AI assistant that responds using openui-lang"
const TRAVEL_PREAMBLE = `You are an AI assistant that responds using openui-lang, a declarative UI language. Your ENTIRE response must be valid openui-lang code — no markdown, no explanations, just openui-lang.
root = Stack(...) must be the first line of every response.`

const finalPrompt = promptWithTravelCards.replace(
  /^You are an AI assistant that responds using openui-lang[^\n]*/,
  TRAVEL_PREAMBLE
)

// ---------------------------------------------------------------------------
// Step 5 — Append travel-specific rules at the end
// ---------------------------------------------------------------------------
const travelRules = `
- ALWAYS prefer Travel Card components (PlaceCard, RouteCard, ItineraryDayCard, MapStaticCard) over generic Cards when rendering travel data.
- Use PlaceCard for every hotel, restaurant, attraction, or POI returned by search_places or find_nearby_places.
- Use RouteCard for every compute_route result — always populate origin, destination, travelMode, duration, and distanceKm.
- Use ItineraryDayCard for multi-day trip plans — one card per day, stops in chronological order.
- Use MapStaticCard when you have lat/lng coordinates from geocode_address or search_places — set center and markers.
- Wrap multiple PlaceCards in a row Stack: Stack([p1, p2, p3], "row", "m", "start", "start", true)
- Stack multiple ItineraryDayCards in a column Stack with gap m.`

const output = finalPrompt.trimEnd() + "\n" + travelRules + "\n"

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------
mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
writeFileSync(OUTPUT_PATH, output, "utf-8")
console.log(`✅  System prompt written to ${OUTPUT_PATH}`)
console.log(`    ${output.split("\n").length} lines, ${output.length} chars`)
