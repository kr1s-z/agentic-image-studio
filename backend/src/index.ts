import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { WebSocketServer } from "ws";
import { jobRoutes, runWorkflow } from "./routes/jobs";
import { hasJob, getJob } from "./store";
import { addClient, removeClient, replayHistory } from "./services/broadcast";
import { isLLMAvailable } from "./services/llm";

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const uploadsDir = path.join(__dirname, "../uploads");
app.use("/api/uploads", express.static(uploadsDir));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    llm: isLLMAvailable() ? "connected" : "simulation",
    replicate: !!process.env.REPLICATE_API_TOKEN ? "connected" : "disabled",
  });
});

app.use("/api", jobRoutes);

/* ---------- WebSocket ---------- */

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const match = url.pathname.match(/^\/api\/jobs\/([^/]+)\/ws$/);

  if (!match) {
    socket.destroy();
    return;
  }

  const jobId = match[1];
  if (!hasJob(jobId)) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    (ws as any).jobId = jobId;
    wss.emit("connection", ws);
  });
});

wss.on("connection", (ws) => {
  const jobId: string = (ws as any).jobId;
  addClient(jobId, ws);
  replayHistory(jobId, ws);

  const job = getJob(jobId);
  if (job && job.status === "pending") {
    job.status = "running";
    runWorkflow(jobId);
  }

  ws.on("close", () => removeClient(jobId, ws));
});

/* ---------- Start ---------- */

server.listen(PORT, () => {
  console.log(`\n  Backend listening on :${PORT}`);
  console.log(`  LLM mode: ${isLLMAvailable() ? "OpenAI (" + (process.env.OPENAI_MODEL || "gpt-4o") + ")" : "SIMULATION (set OPENAI_API_KEY for real LLM)"}`);
  console.log(`  Replicate: ${process.env.REPLICATE_API_TOKEN ? "enabled" : "disabled (set REPLICATE_API_TOKEN for AI img2img)"}`);
  console.log();
});
