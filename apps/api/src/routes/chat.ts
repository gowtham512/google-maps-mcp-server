import { Router } from "express";
import { createOllama } from "ollama-ai-provider-v2";
import { generateText } from "ai";
import { addMessage, getThread } from "@maps-agent/db";
import { aiTools } from "../lib/ai-tools.js";

const router = Router();

const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL ?? "https://ollama.com").replace(/\/v1\/?$/, "");

const ollama = createOllama({
  baseURL: ollamaBaseUrl,
  headers: process.env.OLLAMA_API_KEY
    ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` }
    : undefined,
});

router.post("/chat", async (req, res) => {
  const { threadId, message } = req.body;
  if (!threadId || !message) {
    return res.status(400).json({ error: "threadId and message are required" });
  }

  try {
    const thread = await getThread(threadId);
    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    // Save user message
    await addMessage(threadId, "user", message);

    // Build messages for the model
    const messages = thread.messages.map((m) => ({
      role: m.role as any,
      content: m.content,
    }));
    messages.push({ role: "user", content: message });

    const modelName = process.env.OLLAMA_MODEL ?? "llama3.2";
    const model = ollama(modelName);

    const result = await generateText({
      model,
      messages,
      tools: aiTools,
      system:
        "You are a helpful travel planning assistant with access to Google Maps tools. " +
        "Use the tools when you need location, routing, places, or itinerary data. " +
        "Keep responses concise and actionable. " +
        "When presenting rich results like itineraries, place lists, maps, or dashboards, " +
        "wrap the response in OpenUI Lang markup starting with <Stack>. " +
        "For simple text answers, use plain markdown. " +
        "Example OpenUI Lang for an itinerary:\n" +
        "<Stack>\n" +
        "  <Heading level=\"2\">3-Day Paris Itinerary</Heading>\n" +
        "  <Card>\n" +
        "    <Text><b>Day 1:</b> Eiffel Tower, Louvre Museum</Text>\n" +
        "  </Card>\n" +
        "  <Image src=\"https://maps.googleapis.com/maps/api/staticmap?center=Paris\"/ >\n" +
        "</Stack>",
      maxSteps: 5,
    });

    const responseText = result.text;
    await addMessage(threadId, "assistant", responseText);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(responseText);
  } catch (error: any) {
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message ?? "Internal server error" });
  }
});

export default router;
