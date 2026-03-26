import crypto from "crypto";
import type WebSocket from "ws";
import type { WSMessage, StepKind } from "../types";
import { getJob } from "../store";

const jobClients = new Map<string, Set<WebSocket>>();

export function addClient(jobId: string, ws: WebSocket): void {
  if (!jobClients.has(jobId)) jobClients.set(jobId, new Set());
  jobClients.get(jobId)!.add(ws);
}

export function removeClient(jobId: string, ws: WebSocket): void {
  const clients = jobClients.get(jobId);
  if (!clients) return;
  clients.delete(ws);
  if (clients.size === 0) jobClients.delete(jobId);
}

export function replayHistory(jobId: string, ws: WebSocket): void {
  const job = getJob(jobId);
  if (!job) return;
  for (const msg of job.history) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }
}

function send(jobId: string, msg: WSMessage): void {
  const job = getJob(jobId);
  if (job) job.history.push(msg);

  const clients = jobClients.get(jobId);
  if (!clients) return;
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function makeBase(jobId: string): Pick<WSMessage, "id" | "jobId" | "timestamp"> {
  return { id: crypto.randomUUID(), jobId, timestamp: new Date().toISOString() };
}

export function broadcastStep(
  jobId: string,
  step: StepKind,
  opts: {
    message: string;
    detail?: string;
    iteration: number;
    data?: Record<string, unknown>;
    imageUrl?: string;
  },
): void {
  send(jobId, { ...makeBase(jobId), type: "step", step, ...opts });
}

export function broadcastStatus(
  jobId: string,
  status: string,
  message: string,
  opts?: { progress?: number; iteration?: number },
): void {
  send(jobId, { ...makeBase(jobId), type: "status", status, message, ...opts });
}

export function broadcastCompleted(
  jobId: string,
  opts: {
    finalImageUrl: string;
    summary: string;
    iterations: number;
    totalSteps: number;
    finalScore: number;
  },
): void {
  send(jobId, { ...makeBase(jobId), type: "completed", ...opts });
}

export function broadcastError(
  jobId: string,
  message: string,
  detail?: string,
): void {
  send(jobId, { ...makeBase(jobId), type: "error", message, detail });
}
