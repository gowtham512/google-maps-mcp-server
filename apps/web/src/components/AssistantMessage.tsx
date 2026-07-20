import { Renderer } from "@openuidev/react-lang"
import "@openuidev/react-ui/components.css"

import { mergedTravelLibrary } from "@/lib/customLibrary"

interface AssistantMessageProps {
  content: string | null
  isStreaming: boolean
}

/**
 * Canonical OpenUI rendering (see https://www.openui.com/docs/openui-lang/renderer).
 * The model's raw OpenUI Lang response is passed straight to <Renderer />.
 * The parser validates the output and drops invalid portions, rendering only
 * what's valid — so raw DSL is never shown to the user. During streaming,
 * structure renders first and data fills in progressively.
 */
export function AssistantMessage({ content, isStreaming }: AssistantMessageProps) {
  return (
    <Renderer
      library={mergedTravelLibrary}
      response={content}
      isStreaming={isStreaming}
      onError={(errors) => {
        if (errors.length) console.warn("OpenUI render errors:", errors)
      }}
    />
  )
}
