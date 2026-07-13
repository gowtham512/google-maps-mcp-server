import * as React from "react"
import { Car, Footprints, Bike, Train, ArrowRight, Clock, Ruler, Navigation } from "lucide-react"

type TravelMode = "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT" | "TWO_WHEELER"

interface RouteStep {
  instruction: string
  distance?: string
  duration?: string
}

interface RouteCardProps {
  origin: string
  destination: string
  travelMode?: TravelMode
  duration?: string          // e.g. "1 hour 23 mins"
  distanceKm?: number
  steps?: RouteStep[]
  polylineUrl?: string       // optional static map image showing the route
}

const MODE_META: Record<TravelMode, { icon: React.ElementType; label: string; color: string }> = {
  DRIVE: { icon: Car, label: "Drive", color: "text-blue-600" },
  WALK: { icon: Footprints, label: "Walk", color: "text-emerald-600" },
  BICYCLE: { icon: Bike, label: "Bicycle", color: "text-orange-500" },
  TRANSIT: { icon: Train, label: "Transit", color: "text-violet-600" },
  TWO_WHEELER: { icon: Bike, label: "Two-Wheeler", color: "text-rose-500" },
}

export function RouteCard({
  origin,
  destination,
  travelMode = "DRIVE",
  duration,
  distanceKm,
  steps,
  polylineUrl,
}: RouteCardProps) {
  const [showSteps, setShowSteps] = React.useState(false)
  const meta = MODE_META[travelMode] ?? MODE_META.DRIVE
  const ModeIcon = meta.icon

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden w-full">
      {/* Static map image if provided */}
      {polylineUrl && (
        <div className="h-32 w-full overflow-hidden bg-muted">
          <img src={polylineUrl} alt="Route map" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Mode badge */}
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-1.5 text-sm font-semibold ${meta.color}`}>
            <ModeIcon className="h-4 w-4" />
            {meta.label}
          </div>
          <Navigation className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Origin → Destination */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            {/* Origin */}
            <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-muted/50">
              <div className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-sm font-medium truncate">{origin}</span>
            </div>
            {/* Connector line */}
            <div className="ml-4 my-1 h-4 w-0.5 bg-border" />
            {/* Destination */}
            <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-muted/50">
              <div className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" />
              <span className="text-sm font-medium truncate">{destination}</span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        {(duration || distanceKm != null) && (
          <div className="flex gap-4 border-t pt-3">
            {duration && (
              <div className="flex items-center gap-1.5 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">{duration}</span>
              </div>
            )}
            {distanceKm != null && (
              <div className="flex items-center gap-1.5 text-sm">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">{distanceKm.toFixed(1)} km</span>
              </div>
            )}
          </div>
        )}

        {/* Step-by-step toggle */}
        {steps && steps.length > 0 && (
          <div>
            <button
              onClick={() => setShowSteps((v) => !v)}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              <ArrowRight className={`h-3 w-3 transition-transform ${showSteps ? "rotate-90" : ""}`} />
              {showSteps ? "Hide directions" : `Show ${steps.length} steps`}
            </button>

            {showSteps && (
              <ol className="mt-3 space-y-2 border-t pt-3">
                {steps.map((step, idx) => (
                  <li key={idx} className="flex gap-3 text-sm">
                    <span className="shrink-0 h-5 w-5 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center font-medium">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="leading-snug">{step.instruction}</p>
                      {(step.distance || step.duration) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {[step.distance, step.duration].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
