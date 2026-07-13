import { useState } from "react"
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Loader2 } from "lucide-react"
import type { ToolCall } from "@/lib/api"

interface ToolCallPanelProps {
  tools: ToolCall[]
  isStreaming?: boolean
}

function formatJson(raw: string | undefined): string {
  if (!raw) return ""
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function ToolRow({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  const isDone = tool.status === "done"
  const hasDetails = isDone && (tool.input || tool.result)

  return (
    <div className="border-t first:border-t-0">
      {/* Row header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        disabled={!hasDetails}
      >
        {/* Status icon */}
        {isDone ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        ) : (
          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
        )}

        {/* Tool name */}
        <span className="flex-1 text-sm font-medium truncate">{tool.name}</span>

        {/* DONE badge */}
        {isDone && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">
            DONE
          </span>
        )}

        {/* Expand chevron */}
        {hasDetails && (
          expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded detail — INPUT + RESULT */}
      {expanded && hasDetails && (
        <div className="px-4 pb-4 space-y-3">
          {tool.input && (
            <div>
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-1.5">
                Input
              </p>
              <pre className="rounded-lg bg-zinc-950 text-zinc-100 dark:bg-zinc-900 text-xs p-3 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed max-h-48">
                {formatJson(tool.input)}
              </pre>
            </div>
          )}
          {tool.result && (
            <div>
              <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-1.5">
                Result
              </p>
              <pre className="rounded-lg bg-zinc-950 text-zinc-100 dark:bg-zinc-900 text-xs p-3 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed max-h-64">
                {tool.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ToolCallPanel({ tools, isStreaming = false }: ToolCallPanelProps) {
  const [panelOpen, setPanelOpen] = useState(false)

  if (!tools.length) return null

  const total = tools.length
  const done = tools.filter((t) => t.status === "done").length
  const allDone = done === total && !isStreaming

  return (
    <div className="mt-3 rounded-xl border bg-background overflow-hidden">
      {/* Panel header — always visible */}
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setPanelOpen((v) => !v)}
      >
        {/* Summary icon */}
        {allDone ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        {/* "Tools used" label */}
        <span className="text-sm font-medium text-muted-foreground">Tools used</span>

        {/* Pill: N tools */}
        <span className="text-sm font-medium px-2 py-0.5 rounded-full bg-muted text-foreground">
          {total} {total === 1 ? "tool" : "tools"}
        </span>

        {/* Pill: N/N complete */}
        <span className="text-sm font-medium px-2 py-0.5 rounded-full bg-muted text-foreground">
          {done}/{total} complete
        </span>

        {/* Spacer + chevron */}
        <span className="flex-1" />
        {panelOpen
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        }
      </button>

      {/* Expanded tool rows */}
      {panelOpen && (
        <div>
          {tools.map((tool, idx) => (
            <ToolRow key={tool.id ?? idx} tool={tool} />
          ))}
        </div>
      )}
    </div>
  )
}
