/**
 * travelComponents.tsx
 *
 * Custom OpenUI Lang components for the Travel Planner, defined with
 * `defineComponent` (see https://www.openui.com/docs/openui-lang/defining-components).
 *
 * Design goals:
 *   - Robust: every optional prop is guarded so a missing/partial value never
 *     throws; arrays default to []; broken image URLs fall back gracefully.
 *   - Responsive: Tailwind utility classes with `xs`/`sm` breakpoints, wrapping
 *     rows, truncation, and fluid images.
 *   - Beautiful: uses the app's shadcn design tokens (card/border/muted/primary)
 *     with a subtle entrance animation that only plays once the stream finishes
 *     (gated by `useIsStreaming`) so streaming re-parses never flicker.
 *
 * These are ADDED to the built-in OpenUI library — no built-ins are removed.
 */
import { useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Info,
  Lightbulb,
  MapPin,
  Navigation,
  Route,
  Star,
} from "lucide-react"
import { defineComponent, useIsStreaming } from "@openuidev/react-lang"
import { z } from "zod/v4"

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Entrance-animation class, but only after streaming completes (avoids flicker). */
function useEnterClass(): string {
  const streaming = useIsStreaming()
  return streaming ? "" : "openui-enter"
}

/** Image that degrades to a themed placeholder when the URL is missing/broken. */
function SafeImage({
  src,
  alt,
  className = "",
}: {
  src?: string | null
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className}`}>
        <ImageIcon className="h-6 w-6 opacity-60" />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  )
}

const CARD =
  "rounded-xl border border-border/70 bg-card text-card-foreground shadow-sm overflow-hidden"

// ---------------------------------------------------------------------------
// WeatherCard
// ---------------------------------------------------------------------------
export const WeatherCard = defineComponent({
  name: "WeatherCard",
  description:
    "A weather summary card for a location. Use this to present output from the get_weather tool instead of plain text.",
  props: z.object({
    location: z.string().describe("City or place name, e.g. 'Pune, India'"),
    temperature: z.string().describe("Current temperature with unit, e.g. '28°C'"),
    condition: z.string().describe("Short weather condition, e.g. 'Partly cloudy'"),
    high: z.string().optional().describe("Forecast high temperature, e.g. '31°C'"),
    low: z.string().optional().describe("Forecast low temperature, e.g. '22°C'"),
    icon: z.string().optional().describe("Optional emoji for the condition, e.g. '⛅'"),
  }),
  component: ({ props }) => {
    const enter = useEnterClass()
    return (
      <div className={`${CARD} ${enter} p-4 sm:p-5`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{props.location}</span>
            </div>
            <div className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              {props.temperature}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">{props.condition}</div>
          </div>
          {props.icon ? <div className="text-4xl leading-none sm:text-5xl">{props.icon}</div> : null}
        </div>
        {(props.high || props.low) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {props.high ? (
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium">↑ {props.high}</span>
            ) : null}
            {props.low ? (
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium">↓ {props.low}</span>
            ) : null}
          </div>
        )}
      </div>
    )
  },
})

// ---------------------------------------------------------------------------
// PlaceCard
// ---------------------------------------------------------------------------
export const PlaceCard = defineComponent({
  name: "PlaceCard",
  description:
    "A rich card for a single place / point of interest (from search_places or get_place_details). Put a photo URL in imageUrl when available.",
  props: z.object({
    name: z.string().describe("Place name, e.g. 'Shaniwar Wada'"),
    description: z.string().optional().describe("Short description or editorial summary"),
    imageUrl: z.string().optional().describe("Photo URL for the place"),
    rating: z.string().optional().describe("Rating out of 5, e.g. '4.5'"),
    category: z.string().optional().describe("Category/type, e.g. 'Historical landmark'"),
    address: z.string().optional().describe("Street address or locality"),
  }),
  component: ({ props }) => {
    const enter = useEnterClass()
    return (
      <div className={`${CARD} ${enter} flex flex-col`}>
        {props.imageUrl ? (
          <SafeImage src={props.imageUrl} alt={props.name} className="h-40 w-full sm:h-48" />
        ) : null}
        <div className="flex flex-col gap-1.5 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 font-semibold leading-tight">{props.name}</h3>
            {props.rating ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <Star className="h-3 w-3 fill-current" />
                {props.rating}
              </span>
            ) : null}
          </div>
          {props.category ? (
            <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {props.category}
            </span>
          ) : null}
          {props.description ? (
            <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">
              {props.description}
            </p>
          ) : null}
          {props.address ? (
            <div className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{props.address}</span>
            </div>
          ) : null}
        </div>
      </div>
    )
  },
})

// ---------------------------------------------------------------------------
// ItineraryDay
// ---------------------------------------------------------------------------
export const ItineraryDay = defineComponent({
  name: "ItineraryDay",
  description:
    "One day of a multi-day itinerary: a titled card with a vertical timeline of stops/activities. Use one ItineraryDay per day.",
  props: z.object({
    title: z.string().describe("Day heading, e.g. 'Day 1: Pune → Lonavala'"),
    items: z.array(z.string()).describe("Ordered list of stops/activities for the day"),
    subtitle: z.string().optional().describe("Optional short summary under the title"),
  }),
  component: ({ props }) => {
    const enter = useEnterClass()
    const items = Array.isArray(props.items) ? props.items : []
    return (
      <div className={`${CARD} ${enter} p-4 sm:p-5`}>
        <h3 className="font-semibold leading-tight">{props.title}</h3>
        {props.subtitle ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{props.subtitle}</p>
        ) : null}
        {items.length > 0 && (
          <ol className="mt-3 space-y-0">
            {items.map((item, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  {i < items.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
                </div>
                <span className="pb-3 text-sm leading-relaxed">{item}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    )
  },
})

// ---------------------------------------------------------------------------
// RouteSummary
// ---------------------------------------------------------------------------
export const RouteSummary = defineComponent({
  name: "RouteSummary",
  description:
    "A compact summary of a route between two places (from compute_route or compute_route_with_waypoints): origin → destination with distance/duration.",
  props: z.object({
    origin: z.string().describe("Start location"),
    destination: z.string().describe("End location"),
    distance: z.string().optional().describe("Total distance, e.g. '120 km'"),
    duration: z.string().optional().describe("Total travel time, e.g. '2 hr 45 min'"),
    mode: z.string().optional().describe("Travel mode label, e.g. 'Drive'"),
  }),
  component: ({ props }) => {
    const enter = useEnterClass()
    return (
      <div className={`${CARD} ${enter} p-4 sm:p-5`}>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Route className="h-3.5 w-3.5" />
          <span>{props.mode || "Route"}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
          <span className="min-w-0 break-words">{props.origin}</span>
          <Navigation className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 break-words">{props.destination}</span>
        </div>
        {(props.distance || props.duration) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {props.distance ? (
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium">{props.distance}</span>
            ) : null}
            {props.duration ? (
              <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium">
                <Clock className="h-3 w-3" />
                {props.duration}
              </span>
            ) : null}
          </div>
        )}
      </div>
    )
  },
})

// ---------------------------------------------------------------------------
// TravelTip
// ---------------------------------------------------------------------------
const TIP_STYLES: Record<string, { wrap: string; icon: typeof Info }> = {
  info: { wrap: "border-sky-300/60 bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200", icon: Info },
  tip: { wrap: "border-violet-300/60 bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200", icon: Lightbulb },
  warning: { wrap: "border-amber-300/60 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200", icon: AlertTriangle },
  success: { wrap: "border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200", icon: CheckCircle2 },
}

export const TravelTip = defineComponent({
  name: "TravelTip",
  description:
    "A highlighted callout for tips, advisories, best-time-to-visit, or packing notes. variant controls the color/icon.",
  props: z.object({
    title: z.string().describe("Short bold heading"),
    text: z.string().describe("The tip/advisory body text"),
    variant: z
      .enum(["info", "tip", "warning", "success"])
      .optional()
      .describe("Visual style: info | tip | warning | success (default: tip)"),
  }),
  component: ({ props }) => {
    const enter = useEnterClass()
    const style = TIP_STYLES[props.variant ?? "tip"] ?? TIP_STYLES.tip
    const Icon = style.icon
    return (
      <div className={`${enter} flex gap-3 rounded-xl border p-3.5 sm:p-4 ${style.wrap}`}>
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{props.title}</p>
          <p className="mt-1 text-sm leading-relaxed opacity-90">{props.text}</p>
        </div>
      </div>
    )
  },
})

// ---------------------------------------------------------------------------
// PhotoStrip
// ---------------------------------------------------------------------------
export const PhotoStrip = defineComponent({
  name: "PhotoStrip",
  description:
    "A horizontally scrollable strip of photos (e.g. multiple photo URLs from get_place_details). Broken images are hidden automatically.",
  props: z.object({
    images: z.array(z.string()).describe("List of image URLs"),
    caption: z.string().optional().describe("Optional caption shown above the strip"),
  }),
  component: ({ props }) => {
    const enter = useEnterClass()
    const images = Array.isArray(props.images) ? props.images.filter(Boolean) : []
    if (images.length === 0) return null
    return (
      <div className={enter}>
        {props.caption ? (
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{props.caption}</p>
        ) : null}
        <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          {images.map((src, i) => (
            <SafeImage
              key={i}
              src={src}
              alt={props.caption ? `${props.caption} ${i + 1}` : `Photo ${i + 1}`}
              className="h-28 w-40 shrink-0 rounded-lg border border-border/60 sm:h-32 sm:w-48"
            />
          ))}
        </div>
      </div>
    )
  },
})

// ---------------------------------------------------------------------------
// Registry — imported by travelLibrary.ts
// ---------------------------------------------------------------------------
export const travelComponents = [
  WeatherCard,
  PlaceCard,
  ItineraryDay,
  RouteSummary,
  TravelTip,
  PhotoStrip,
]
