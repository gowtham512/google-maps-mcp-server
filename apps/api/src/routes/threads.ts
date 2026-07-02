import { Router } from "express";
import {
  createThread,
  getThreads,
  getThread,
  addMessage,
  updateThreadTitle,
  deleteThread,
} from "@maps-agent/db";

const router = Router();

router.get("/threads", async (_req, res) => {
  const threads = await getThreads();
  res.json({ threads });
});

router.post("/threads", async (req, res) => {
  const { title } = req.body;
  const thread = await createThread(title);
  res.json({ thread });
});

router.get("/threads/:id", async (req, res) => {
  const thread = await getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: "Thread not found" });
  res.json({ thread });
});

router.delete("/threads/:id", async (req, res) => {
  await deleteThread(req.params.id);
  res.json({ ok: true });
});

router.patch("/threads/:id", async (req, res) => {
  const { title } = req.body;
  const thread = await updateThreadTitle(req.params.id, title);
  res.json({ thread });
});

export default router;
