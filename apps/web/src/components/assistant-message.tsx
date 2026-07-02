"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui";
import { createToolProvider } from "@/lib/tool-provider";

type Props = {
  content: string;
  isStreaming?: boolean;
};

const toolProvider = createToolProvider();

export default function AssistantMessage({ content, isStreaming }: Props) {
  const [renderError, setRenderError] = useState(false);

  // If content looks like plain text (no XML-like tags), render markdown.
  const looksLikeOpenUI = useMemo(() => {
    return content.trim().startsWith("<") || /<[A-Z][A-Za-z]/.test(content);
  }, [content]);

  if (!looksLikeOpenUI || renderError) {
    return (
      <div style={{ lineHeight: 1.6 }}>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  }

  return (
    <Renderer
      library={openuiLibrary}
      response={content}
      isStreaming={isStreaming}
      toolProvider={toolProvider}
      onError={(errors) => {
        if (errors.length > 0) {
          console.warn("OpenUI render errors:", errors);
          setRenderError(true);
        }
      }}
    />
  );
}
