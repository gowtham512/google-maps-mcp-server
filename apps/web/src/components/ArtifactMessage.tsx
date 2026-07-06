import * as React from "react"
import { useMemo, useState } from "react"
import { defineArtifactRenderer, type ArtifactRendererControls } from "@openuidev/react-ui"
import { Download, FileJson, FileText, Loader2, MapPin, Presentation } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { downloadArtifact, type ArtifactFormat } from "@/lib/api"

interface SlidesArtifact {
  type: "slides"
  title: string
  slides: Array<{
    title: string
    subtitle?: string
    image_url?: string
    bullets?: string[]
  }>
}

interface ReportArtifact {
  type: "report"
  title: string
  sections: Array<{
    heading: string
    image_url?: string
    body: string
  }>
}

type TravelArtifact = SlidesArtifact | ReportArtifact

const ALL_FORMATS: { format: ArtifactFormat; label: string; icon: React.ElementType }[] = [
  { format: "auto", label: "Download", icon: Download },
  { format: "json", label: "JSON", icon: FileJson },
  { format: "pptx", label: "PPT", icon: Presentation },
  { format: "pdf", label: "PDF", icon: FileText },
]

const FORMATS_BY_TYPE: Record<string, ArtifactFormat[]> = {
  slides: ["auto", "pptx", "json", "pdf"],
  report: ["auto", "pdf", "json", "pptx"],
}

function isSlidesArtifact(data: unknown): data is SlidesArtifact {
  const d = data as Record<string, unknown> | undefined
  return Boolean(d && d.type === "slides" && typeof d.title === "string" && Array.isArray(d.slides))
}

function isReportArtifact(data: unknown): data is ReportArtifact {
  const d = data as Record<string, unknown> | undefined
  return Boolean(d && d.type === "report" && typeof d.title === "string" && Array.isArray(d.sections))
}

function makeId(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artifact"
}

const slideRenderer = defineArtifactRenderer<SlidesArtifact>({
  type: "travel_slides",
  toolName: "artifact:create",
  label: "Slide deck",
  icon: React.createElement(Presentation, { className: "h-4 w-4" }),
  parser: ({ response }) => {
    if (!isSlidesArtifact(response)) return null
    return {
      props: response,
      meta: {
        id: makeId(response.title),
        version: 1,
        heading: response.title,
        type: "travel_slides",
      },
    }
  },
  preview: (props) => (
    <div className="space-y-2">
      <p className="text-sm font-medium">{props.title}</p>
      <p className="text-xs text-muted-foreground">{props.slides.length} slides</p>
    </div>
  ),
  actual: (props) => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{props.title}</h3>
      <ol className="space-y-3">
        {props.slides.map((slide, idx) => (
          <li key={idx} className="rounded border p-3">
            <p className="font-medium">
              {idx + 1}. {slide.title}
            </p>
            {slide.subtitle ? <p className="text-sm text-muted-foreground">{slide.subtitle}</p> : null}
            {slide.bullets?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {slide.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  ),
})

const reportRenderer = defineArtifactRenderer<ReportArtifact>({
  type: "travel_report",
  toolName: "artifact:create",
  label: "Report",
  icon: React.createElement(FileText, { className: "h-4 w-4" }),
  parser: ({ response }) => {
    if (!isReportArtifact(response)) return null
    return {
      props: response,
      meta: {
        id: makeId(response.title),
        version: 1,
        heading: response.title,
        type: "travel_report",
      },
    }
  },
  preview: (props) => (
    <div className="space-y-2">
      <p className="text-sm font-medium">{props.title}</p>
      <p className="text-xs text-muted-foreground">{props.sections.length} sections</p>
    </div>
  ),
  actual: (props) => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{props.title}</h3>
      {props.sections.map((section, idx) => (
        <div key={idx} className="rounded border p-3">
          <p className="font-medium">{section.heading}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{section.body}</p>
        </div>
      ))}
    </div>
  ),
})

export function ArtifactMessage({
  threadId,
  messageId,
  artifactData,
}: {
  threadId: string
  messageId?: number
  artifactData: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [downloading, setDownloading] = useState<ArtifactFormat | null>(null)

  const parsed = useMemo<TravelArtifact | null>(() => {
    if (!artifactData) return null
    try {
      const data = JSON.parse(artifactData) as unknown
      if (isSlidesArtifact(data) || isReportArtifact(data)) return data
      return null
    } catch {
      return null
    }
  }, [artifactData])

  const canDownload = messageId != null && messageId > 0
  const formats = parsed ? FORMATS_BY_TYPE[parsed.type] || ["auto", "json"] : ["auto", "json"]

  const controls: ArtifactRendererControls = {
    isActive: expanded,
    isStreaming: false,
    open: () => setExpanded(true),
    close: () => setExpanded(false),
    toggle: () => setExpanded((v) => !v),
  }

  async function handleDownload(format: ArtifactFormat) {
    if (!canDownload || messageId == null) return
    setDownloading(format)
    try {
      await downloadArtifact(threadId, messageId, format)
    } catch (err) {
      console.error("Download failed:", err)
      alert(err instanceof Error ? err.message : "Download failed")
    } finally {
      setDownloading(null)
    }
  }

  if (!parsed) return null

  const renderContent = () => {
    if (parsed.type === "slides") {
      const result = slideRenderer.parser({ args: undefined, response: parsed }, { isStreaming: false })
      if (!result) return null
      return expanded ? slideRenderer.actual(result.props, controls) : slideRenderer.preview(result.props, controls)
    }
    const result = reportRenderer.parser({ args: undefined, response: parsed }, { isStreaming: false })
    if (!result) return null
    return expanded ? reportRenderer.actual(result.props, controls) : reportRenderer.preview(result.props, controls)
  }

  const content = renderContent()
  if (!content) return null

  return (
    <Card className="mt-2 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Travel artifact</CardTitle>
          </div>
          {canDownload && (
            <div className="flex flex-wrap justify-end gap-1">
              {formats
                .map((f) => ALL_FORMATS.find((item) => item.format === f)!)
                .filter(Boolean)
                .map(({ format, label, icon: Icon }) => (
                  <Button
                    key={format}
                    variant={format === "auto" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDownload(format)}
                    disabled={downloading !== null}
                  >
                    {downloading === format ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Icon className="mr-1 h-3 w-3" />
                    )}
                    {label}
                  </Button>
                ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {content}
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-auto p-0 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show details"}
        </Button>
      </CardContent>
    </Card>
  )
}
