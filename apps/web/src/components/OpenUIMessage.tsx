import * as React from "react"
import { useState } from "react"
import { Renderer } from "@openuidev/react-lang"
import { openuiLibrary } from "@openuidev/react-ui"
import "@openuidev/react-ui/components.css"
import { Download, FileJson, FileText, Loader2, Presentation } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ArtifactMessage } from "@/components/ArtifactMessage"
import { downloadArtifact, type ArtifactFormat } from "@/lib/api"

interface OpenUIMessageProps {
  threadId: string
  messageId?: number
  code: string | null
  artifactType?: string | null
  artifactData?: string | null
}

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

export function OpenUIMessage({
  threadId,
  messageId,
  code,
  artifactType,
  artifactData,
}: OpenUIMessageProps) {
  const [downloading, setDownloading] = useState<ArtifactFormat | null>(null)

  if (!code || !code.trim()) return null

  const hasArtifact = Boolean(artifactData)
  const canDownload = hasArtifact && messageId != null && messageId > 0
  const formats = FORMATS_BY_TYPE[artifactType || "" ] || ["auto", "json"]

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

  return (
    <div className="openui-render border rounded-md p-4 bg-card">
      {canDownload && (
        <div className="flex justify-end gap-2 mb-2">
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
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="mr-1 h-4 w-4" />
                )}
                {label}
              </Button>
            ))}
        </div>
      )}
      <Renderer
        library={openuiLibrary}
        response={code}
        isStreaming={false}
        onError={(errors) => {
          if (errors.length) {
            console.warn("OpenUI render errors:", errors)
          }
        }}
      />
      {hasArtifact && (
        <ArtifactMessage
          threadId={threadId}
          messageId={messageId}
          artifactData={artifactData ?? null}
        />
      )}
    </div>
  )
}
