/**
 * generate-prompt.mjs
 *
 * Thin wrapper that calls the official @openuidev/cli to generate the system
 * prompt from travelLibrary.ts and write it to the backend.
 *
 * The CLI:
 *   1. Bundles travelLibrary.ts with esbuild (handles React/TSX/path aliases)
 *   2. Auto-detects the `library` and `promptOptions` exports
 *   3. Calls library.prompt(promptOptions) to produce the full prompt
 *   4. Writes it to the output path
 *
 * Usage:
 *   npm run generate-prompt        (from apps/web/)
 */

import { execSync } from "child_process"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const LIBRARY = resolve(__dirname, "../src/lib/travelLibrary.ts")
const OUTPUT   = resolve(__dirname, "../../backend/openui_system_prompt.txt")

console.log("Generating system prompt via @openuidev/cli...")
console.log(`  Library : ${LIBRARY}`)
console.log(`  Output  : ${OUTPUT}`)

execSync(
  `npx @openuidev/cli@latest generate "${LIBRARY}" --out "${OUTPUT}" --no-interactive`,
  { stdio: "inherit", cwd: resolve(__dirname, "..") }
)

console.log("Done.")
