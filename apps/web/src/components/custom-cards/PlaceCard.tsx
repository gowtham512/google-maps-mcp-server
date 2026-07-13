import * as React from "react"
import { MapPin, Star, Clock, ExternalLink, DollarSign } from "lucide-react"

interface PlaceCardProps {
  name: string
  address?: string
  rating?: number
  totalRatings?: number
  priceLevel?: number        // 1–4, maps to $–$$$$
  isOpen?: boolean           // true = open, false = closed, undefined = unknown
  category?: string          // e.g. "Restaurant", "Hotel", "Museum"
  photoUrl?: string          // optional hero image
  mapsUrl?: string           // Google Maps link
  phone?: string
  website?: string
}

function PriceLevel({ level }: { level: number }) {
  const symbols = Array.from({ length: 4 }, (_, i) => (
    <span key={i} className={i < level ? "text-foreground" : "text-muted-foreground/30"}>
      $
    </span>
  ))
  return <span className="font-medium text-sm">{symbols}</span>
}

function StarRating({ rating, total }: { rating: number; total?: number }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < full
                ? "fill-amber-400 text-amber-400"
                : i === full && half
                ? "fill-amber-400/50 text-amber-400"
                : "fill-muted text-muted-foreground/20"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground font-medium">
        {rating.toFixed(1)}
        {total != null && ` (${total.toLocaleString()})`}
      </span>
    </div>
  )
}

export function PlaceCard({
  name,
  address,
  rating,
  totalRatings,
  priceLevel,
  isOpen,
  category,
  photoUrl,
  mapsUrl,
  phone,
  website,
}: PlaceCardProps) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden w-full">
      {/* Hero photo */}
      {photoUrl ? (
        <div className="h-36 w-full overflow-hidden bg-muted">
          <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="h-20 w-full bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-purple-500/10 flex items-center justify-center">
          <MapPin className="h-8 w-8 text-blue-500/40" />
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-base leading-tight truncate">{name}</h3>
            {category && (
              <span className="text-xs text-muted-foreground">{category}</span>
            )}
          </div>
          {/* Open/closed badge */}
          {isOpen !== undefined && (
            <span
              className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                isOpen
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              }`}
            >
              {isOpen ? "Open" : "Closed"}
            </span>
          )}
        </div>

        {/* Rating */}
        {rating != null && (
          <StarRating rating={rating} total={totalRatings} />
        )}

        {/* Address */}
        {address && (
          <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span className="leading-tight">{address}</span>
          </div>
        )}

        {/* Price level */}
        {priceLevel != null && (
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <PriceLevel level={priceLevel} />
          </div>
        )}

        {/* Footer actions */}
        {(mapsUrl || phone || website) && (
          <div className="flex flex-wrap gap-2 pt-1 border-t">
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Maps
              </a>
            )}
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Website
              </a>
            )}
            {phone && (
              <a
                href={`tel:${phone}`}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <Clock className="h-3 w-3" />
                {phone}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
