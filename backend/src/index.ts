import "./loadEnv";
import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { WebSocketServer } from "ws";
import { jobRoutes, runWorkflow } from "./routes/jobs";
import { hasJob, getJob } from "./store";
import { addClient, removeClient, replayHistory } from "./services/broadcast";
import { llmModelName } from "./services/llm";
import { isReplicateConfigured } from "./config/env";
import { isObservabilityEnabled } from "./services/observability";

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const uploadsDir = path.join(__dirname, "../uploads");
app.use("/api/uploads", express.static(uploadsDir));

app.get("/api/health", (_req, res) => {
  const configured = isReplicateConfigured();
  res.json({
    status: configured ? "ok" : "misconfigured",
    replicate: configured ? "configured" : "missing REPLICATE_API_TOKEN",
    llmModel: llmModelName(),
    observability: isObservabilityEnabled() ? "langfuse" : "disabled",
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
  const configured = isReplicateConfigured();
  console.log(`  Replicate: ${configured ? "configured" : "NOT configured (set REPLICATE_API_TOKEN)"}`);
  console.log(`  LLM model: ${llmModelName()}`);
  console.log(`  Observability: ${isObservabilityEnabled() ? "Langfuse enabled" : "disabled"}`);
  if (!configured) console.warn("  ⚠  REPLICATE_API_TOKEN is missing — all API calls will fail");
  console.log();
});
