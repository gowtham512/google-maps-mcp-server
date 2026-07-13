import * as React from "react"
import { CalendarDays, MapPin, Clock, Utensils, Hotel, Camera, Navigation, Landmark } from "lucide-react"

type StopType = "attraction" | "restaurant" | "hotel" | "transport" | "activity" | "other"

interface ItineraryStop {
  time?: string            // e.g. "09:00 AM"
  name: string
  type?: StopType
  duration?: string        // e.g. "2 hours"
  description?: string
  address?: string
}

interface ItineraryDayCardProps {
  day: number              // Day number in the trip (1, 2, 3 …)
  date?: string            // e.g. "Monday, Jul 14"
  title?: string           // e.g. "Arrival & City Tour"
  location?: string        // City or region for the day
  stops: ItineraryStop[]
  notes?: string           // Any tips or notes for the day
}

const STOP_ICONS: Record<StopType, React.ElementType> = {
  attraction: Landmark,
  restaurant: Utensils,
  hotel: Hotel,
  transport: Navigation,
  activity: Camera,
  other: MapPin,
}

const STOP_COLORS: Record<StopType, string> = {
  attraction: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  restaurant: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  hotel: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  transport: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  activity: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  other: "bg-muted text-muted-foreground",
}

const LINE_COLORS: Record<StopType, string> = {
  attraction: "bg-blue-300",
  restaurant: "bg-orange-300",
  hotel: "bg-purple-300",
  transport: "bg-slate-300",
  activity: "bg-emerald-300",
  other: "bg-border",
}

function StopRow({ stop, isLast }: { stop: ItineraryStop; isLast: boolean }) {
  const type: StopType = stop.type ?? "other"
  const Icon = STOP_ICONS[type]
  const iconClass = STOP_COLORS[type]
  const lineClass = LINE_COLORS[type]

  return (
    <div className="flex gap-3">
      {/* Timeline column */}
      <div className="flex flex-col items-center">
        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        {!isLast && <div className={`mt-1 flex-1 w-0.5 min-h-[24px] ${lineClass}`} />}
      </div>

      {/* Content column */}
      <div className={`pb-4 min-w-0 flex-1 ${isLast ? "" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight">{stop.name}</p>
            {stop.address && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{stop.address}</p>
            )}
            {stop.description && (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{stop.description}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            {stop.time && (
              <p className="text-xs font-semibold text-foreground">{stop.time}</p>
            )}
            {stop.duration && (
              <p className="text-xs text-muted-foreground flex items-center gap-0.5 justify-end mt-0.5">
                <Clock className="h-3 w-3" />
                {stop.duration}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ItineraryDayCard({ day, date, title, location, stops, notes }: ItineraryDayCardProps) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden w-full">
      {/* Day header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-lg">{day}</span>
          </div>
          <div>
            <p className="text-white font-semibold text-base leading-tight">
              {title ?? `Day ${day}`}
            </p>
            {(date || location) && (
              <div className="flex items-center gap-2 mt-0.5">
                {date && (
                  <span className="text-white/80 text-xs flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {date}
                  </span>
                )}
                {location && (
                  <span className="text-white/80 text-xs flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {location}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="text-white/70 text-xs font-medium">
          {stops.length} {stops.length === 1 ? "stop" : "stops"}
        </div>
      </div>

      {/* Stops timeline */}
      <div className="p-4">
        {stops.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No stops for this day.</p>
        ) : (
          stops.map((stop, idx) => (
            <StopRow key={idx} stop={stop} isLast={idx === stops.length - 1} />
          ))
        )}

        {/* Day notes */}
        {notes && (
          <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              💡 {notes}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
