import * as React from "react"
import { MapPin, ExternalLink, ZoomIn } from "lucide-react"

interface MapMarker {
  label?: string      // single char label shown on pin, e.g. "A", "1"
  lat: number
  lng: number
  color?: string      // "red" | "blue" | "green" | "yellow" | "purple" (default "red")
}

interface MapStaticCardProps {
  title?: string
  center?: { lat: number; lng: number }
  zoom?: number                  // 1–20 (default 13)
  markers?: MapMarker[]
  width?: number                 // default 600
  height?: number                // default 300
  mapType?: "roadmap" | "satellite" | "terrain" | "hybrid"
  apiKey?: string                // Maps Static API key — injected at render time
}

/**
 * Build a Google Maps Static API URL from props.
 * Docs: https://developers.google.com/maps/documentation/maps-static/start
 */
function buildStaticMapUrl(props: MapStaticCardProps): string {
  const {
    center,
    zoom = 13,
    markers = [],
    width = 600,
    height = 300,
    mapType = "roadmap",
    apiKey = "",
  } = props

  const base = "https://maps.googleapis.com/maps/api/staticmap"
  const params = new URLSearchParams()

  params.set("size", `${width}x${height}`)
  params.set("maptype", mapType)
  params.set("zoom", String(zoom))
  params.set("scale", "2")  // retina

  if (center) {
    params.set("center", `${center.lat},${center.lng}`)
  } else if (markers.length > 0) {
    // Auto-center on first marker if no explicit center
    params.set("center", `${markers[0].lat},${markers[0].lng}`)
  }

  // Append marker params (each one is a separate `markers` entry)
  markers.forEach((m) => {
    const color = m.color ?? "red"
    const label = m.label ? `|label:${m.label.charAt(0).toUpperCase()}` : ""
    params.append("markers", `color:${color}${label}|${m.lat},${m.lng}`)
  })

  if (apiKey) params.set("key", apiKey)

  return `${base}?${params.toString()}`
}

/**
 * Build a Google Maps link that opens the location or directions.
 */
function buildMapsLink(props: MapStaticCardProps): string {
  const { center, markers = [] } = props
  const target = center ?? (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : null)
  if (!target) return "https://maps.google.com"
  return `https://www.google.com/maps/@${target.lat},${target.lng},${props.zoom ?? 13}z`
}

export function MapStaticCard({
  title,
  center,
  zoom = 13,
  markers = [],
  width = 600,
  height = 300,
  mapType = "roadmap",
  apiKey = "",
}: MapStaticCardProps) {
  const [enlarged, setEnlarged] = React.useState(false)
  const hasKey = Boolean(apiKey)
  const imgUrl = hasKey
    ? buildStaticMapUrl({ title, center, zoom, markers, width, height, mapType, apiKey })
    : null
  const mapsLink = buildMapsLink({ center, zoom, markers })

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden w-full">
      {/* Title bar */}
      {title && (
        <div className="px-4 py-2.5 flex items-center justify-between border-b">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-500" />
            <span className="font-semibold text-sm">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {imgUrl && (
              <button
                onClick={() => setEnlarged((v) => !v)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Toggle map size"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            )}
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 transition-colors"
              aria-label="Open in Google Maps"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      )}

      {/* Map image or placeholder */}
      {imgUrl ? (
        <div
          className={`overflow-hidden transition-all duration-300 ${enlarged ? "h-72" : "h-48"}`}
          style={{ background: "#e5e7eb" }}
        >
          <img
            src={imgUrl}
            alt={title ?? "Map"}
            className="w-full h-full object-cover cursor-pointer"
            onClick={() => setEnlarged((v) => !v)}
          />
        </div>
      ) : (
        /* Placeholder when no API key is injected */
        <div className="h-48 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-100 to-blue-50 dark:from-slate-900 dark:to-blue-950">
          <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <MapPin className="h-6 w-6 text-blue-500" />
          </div>
          {center && (
            <p className="text-xs text-muted-foreground">
              {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
            </p>
          )}
          {markers.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {markers.length} {markers.length === 1 ? "location" : "locations"}
            </p>
          )}
          <a
            href={mapsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            Open in Google Maps
          </a>
        </div>
      )}

      {/* Marker legend */}
      {markers.length > 0 && (
        <div className="px-4 py-2.5 border-t flex flex-wrap gap-x-4 gap-y-1">
          {markers.map((m, idx) => (
            <div key={idx} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: m.color ?? "red" }}
              />
              {m.label && <span className="font-medium text-foreground">{m.label}.</span>}
              <span className="truncate max-w-[120px]">
                {m.lat.toFixed(4)}, {m.lng.toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
