import { tool } from "ai";
import { tools } from "@maps-agent/maps-tools";

export const aiTools = Object.fromEntries(
  tools.map((t) => [
    t.name,
    tool({
      description: t.description,
      parameters: t.inputSchema,
      execute: async (args) => t.execute(args),
    }),
  ]),
);
