import axios from "axios";
import sharp from "sharp";
import type { VisionAnalysis, Plan, Critique, WSMessage } from "../types";
import {
  visionMultiImageNote,
  visionSystemPrompt,
  visionUserText,
  plannerSystemPrompt,
  plannerUserText,
  CRITIC_SYSTEM_PROMPT,
  criticUserText,
} from "../prompts/llm";
import { startGeneration } from "./observability";

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
const LLM_MODEL = process.env.LLM_MODEL || "openai/gpt-4o";
const TIMEOUT = 120_000;
const POLL_INTERVAL = 2_000;
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 2_000;
const MIN_REQUEST_GAP_MS = Number(process.env.LLM_MIN_REQUEST_GAP_MS || 2000);
let nextAllowedRequestAt = 0;

export function llmModelName(): string {
  return LLM_MODEL;
}

function log(msg: string): void {
  console.log(`[llm] ${msg}`);
}

function parseJSON<T>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  return JSON.parse(cleaned.trim());
}

async function parseJSONWithRepair<T>(raw: string): Promise<T> {
  try {
    return parseJSON<T>(raw);
  } catch (firstErr) {
    log("Invalid JSON from LLM — attempting repair pass");
    const repaired = await predict({
      system_prompt:
        "You convert malformed JSON-like text into strict valid JSON. Return JSON only, no markdown, no commentary.",
      prompt:
        `Fix this content into valid JSON while preserving meaning:\n\n${raw.slice(0, 12_000)}`,
      temperature: 0,
      max_completion_tokens: 2000,
    });
    try {
      return parseJSON<T>(repaired);
    } catch {
      throw firstErr;
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function retryDelay(attempt: number): number {
  return RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 1_000;
}

function retryAfterMs(err: unknown): number | undefined {
  if (!axios.isAxiosError(err)) return undefined;
  const h = err.response?.headers?.["retry-after"];
  if (!h) return undefined;
  const first = Array.isArray(h) ? h[0] : h;
  const secs = Number(first);
  if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  return undefined;
}

async function waitForRateWindow(): Promise<void> {
  const now = Date.now();
  if (now < nextAllowedRequestAt) {
    await new Promise((r) => setTimeout(r, nextAllowedRequestAt - now));
  }
}

/**
 * Call a Replicate-hosted LLM via the predictions API.
 * Retries on 429/5xx with exponential backoff.
 */
async function predict(input: Record<string, unknown>): Promise<string> {
  if (!REPLICATE_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN is not set — cannot call LLM");
  }

  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const wait = retryAfterMs(lastErr) ?? retryDelay(attempt - 1);
      log(`Rate limited — retrying in ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
      await new Promise((r) => setTimeout(r, wait));
    }

    try {
      await waitForRateWindow();
      const createRes = await axios.post(
        `https://api.replicate.com/v1/models/${LLM_MODEL}/predictions`,
        { input },
        {
          headers: {
            Authorization: `Bearer ${REPLICATE_TOKEN}`,
            "Content-Type": "application/json",
            Prefer: "wait",
          },
          timeout: TIMEOUT,
        },
      );
      nextAllowedRequestAt = Date.now() + MIN_REQUEST_GAP_MS;

      let prediction = createRes.data;

      while (
        prediction.status !== "succeeded" &&
        prediction.status !== "failed" &&
        prediction.status !== "canceled"
      ) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        const pollRes = await axios.get(prediction.urls.get, {
          headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
          timeout: 30_000,
        });
        prediction = pollRes.data;
      }

      if (prediction.status !== "succeeded") {
        throw new Error(
          `LLM prediction failed: ${prediction.error || prediction.status}`,
        );
      }

      const output = prediction.output;
      if (Array.isArray(output)) return output.join("");
      return String(output);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) throw err;
    }
  }

  throw lastErr;
}

async function imageToDataUri(buf: Buffer): Promise<string> {
  const resized = await sharp(buf)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${resized.toString("base64")}`;
}

/* ------------------------------------------------------------------ */
/*  Vision Analysis                                                    */
/* ------------------------------------------------------------------ */

export async function analyzeImage(
  imageBuffers: Buffer[],
  goal: string,
  history: WSMessage[],
  jobId?: string,
): Promise<VisionAnalysis> {
  log(`Calling vision analysis on ${imageBuffers.length} image(s)…`);

  const imageUris = await Promise.all(imageBuffers.map(imageToDataUri));

  const prevFeedback = history
    .filter(
      (h) =>
        h.type === "step" &&
        h.step === "critic" &&
        h.data &&
        typeof h.data.feedback === "string",
    )
    .map((h) => `- Iteration ${h.iteration}: ${h.data!.feedback}`)
    .join("\n");

  const historySection = prevFeedback
    ? `\nPrevious critic feedback:\n${prevFeedback}`
    : "";

  const imageNote = visionMultiImageNote(imageBuffers.length);

  const obs = jobId
    ? startGeneration(jobId, "llm-vision", LLM_MODEL, { imageCount: imageBuffers.length })
    : null;
  const content = await predict({
    system_prompt: visionSystemPrompt(imageNote),
    prompt: visionUserText(goal, historySection, imageBuffers.length > 1),
    image_input: imageUris,
    temperature: 0.3,
    max_completion_tokens: 2000,
  });
  try {
    const parsed = await parseJSONWithRepair<VisionAnalysis>(content);
    obs?.end(parsed);
    return parsed;
  } catch (err) {
    obs?.fail(err);
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Planning                                                           */
/* ------------------------------------------------------------------ */

export async function createPlan(
  goal: string,
  analysis: VisionAnalysis,
  iteration: number,
  maxIterations: number,
  history: WSMessage[],
  modelId: string,
  replicateAvailable: boolean,
  jobId?: string,
): Promise<Plan> {
  log("Calling planner…");

  const prevCritique = history
    .filter((h) => h.type === "step" && h.step === "critic" && h.data)
    .map(
      (h) =>
        `Iteration ${h.iteration} — score ${(h.data as Record<string, unknown>).score}/10: ${(h.data as Record<string, unknown>).feedback}`,
    )
    .join("\n");

  const feedbackSection = prevCritique
    ? `\nPrevious critic feedback to address:\n${prevCritique}`
    : "";

  const obs = jobId
    ? startGeneration(jobId, "llm-planner", LLM_MODEL, { iteration, modelId })
    : null;
  const content = await predict({
    system_prompt: plannerSystemPrompt(replicateAvailable, modelId),
    prompt: plannerUserText(
      goal,
      iteration,
      maxIterations,
      JSON.stringify(analysis),
      feedbackSection,
      modelId,
    ),
    temperature: 0.3,
    max_completion_tokens: 2000,
  });
  try {
    const parsed = await parseJSONWithRepair<Plan>(content);
    obs?.end({ steps: parsed.steps.length, reasoning: parsed.reasoning });
    return parsed;
  } catch (err) {
    obs?.fail(err);
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Critic / Reflection                                                */
/* ------------------------------------------------------------------ */

export async function critique(
  imageBuffer: Buffer,
  goal: string,
  iteration: number,
  maxIterations: number,
  history: WSMessage[],
  jobId?: string,
): Promise<Critique> {
  log("Calling critic…");

  const dataUri = await imageToDataUri(imageBuffer);

  const histSummary = history
    .filter((h) => h.type === "step")
    .map((h) => `[iter ${h.iteration}] ${h.step}: ${h.message}`)
    .join("\n");

  const obs = jobId
    ? startGeneration(jobId, "llm-critic", LLM_MODEL, { iteration, maxIterations })
    : null;
  const content = await predict({
    system_prompt: CRITIC_SYSTEM_PROMPT,
    prompt: criticUserText(goal, iteration, maxIterations, histSummary),
    image_input: [dataUri],
    temperature: 0.3,
    max_completion_tokens: 2000,
  });
  try {
    const parsed = await parseJSONWithRepair<Critique>(content);
    obs?.end({ score: parsed.score, approved: parsed.approved });
    return parsed;
  } catch (err) {
    obs?.fail(err);
    throw err;
  }
}
