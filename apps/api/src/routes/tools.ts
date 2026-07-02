import { Router } from "express";
import { toolMap } from "@maps-agent/maps-tools";

const router = Router();

router.post("/tools/:name", async (req, res) => {
  const tool = toolMap.get(req.params.name);
  if (!tool) {
    return res.status(404).json({ error: `Unknown tool: ${req.params.name}` });
  }

  const parsed = tool.inputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  try {
    const result = await tool.execute(parsed.data);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
