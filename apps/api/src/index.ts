import "dotenv/config";
import cors from "cors";
import express from "express";
import { prisma } from "@maps-agent/db";

import chatRoutes from "./routes/chat.js";
import healthRoutes from "./routes/health.js";
import threadsRoutes from "./routes/threads.js";
import toolsRoutes from "./routes/tools.js";

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json());

app.use(healthRoutes);
app.use("/api", chatRoutes);
app.use("/api", threadsRoutes);
app.use("/api", toolsRoutes);

async function main() {
  await prisma.$connect();
  app.listen(port, "0.0.0.0", () => {
    console.log(`Maps Agent API listening on http://0.0.0.0:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
