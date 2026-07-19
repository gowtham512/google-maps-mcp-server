/**
 * travelLibrary.ts
 *
 * The canonical OpenUI library for the Travel Planner app.
 *
 * Exports:
 *   - `library`       — the built-in OpenUI component library
 *   - `promptOptions` — preamble, rules, and examples for prompt generation
 *
 * The @openuidev/cli reads this file to generate the system prompt:
 *   npx @openuidev/cli generate ./src/lib/travelLibrary.ts --out ../../backend/openui_system_prompt.txt
 *
 * The CLI bundles this file with esbuild so React/TSX imports work fine.
 */

import { createLibrary, type PromptOptions } from "@openuidev/react-lang"
import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui/genui-lib"

// ---------------------------------------------------------------------------
// Library — built-in OpenUI components only
// ---------------------------------------------------------------------------
export const library = createLibrary({
  root: "Stack",
  components: [
    // All built-in OpenUI components (Stack, Card, Table, BarChart, Tabs, Form, etc.)
    ...Object.values(openuiLibrary.components),
  ],
  componentGroups: [
    // All built-in groups (Layout, Content, Charts, Forms, etc.)
    ...(openuiLibrary.componentGroups ?? []),
  ],
})

// ---------------------------------------------------------------------------
// Prompt options — built-in preamble, rules, and examples
// ---------------------------------------------------------------------------
export const promptOptions: PromptOptions = {
  preamble:
    "You are an AI assistant that responds using openui-lang, a declarative UI language. " +
    "Your ENTIRE response must be valid openui-lang code — no markdown, no explanations, just openui-lang. " +
    "root = Stack(...) must be the first line of every response.",

  additionalRules: [
    // Spread all built-in rules
    ...(openuiPromptOptions.additionalRules ?? []),
  ],

  examples: [
    // Built-in examples
    ...(openuiPromptOptions.examples ?? []),
  ],
}
