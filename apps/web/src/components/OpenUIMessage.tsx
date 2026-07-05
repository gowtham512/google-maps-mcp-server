import { Renderer } from "@openuidev/react-lang"
import { openuiLibrary } from "@openuidev/react-ui"

interface OpenUIMessageProps {
  code: string | null
}

export function OpenUIMessage({ code }: OpenUIMessageProps) {
  if (!code || !code.trim()) return null

  return (
    <div className="openui-render border rounded-md p-4 bg-card">
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
    </div>
  )
}