import axios from "axios";
import sharp from "sharp";
import type { VisionAnalysis, Plan, Critique, WSMessage } from "../types";
import {
  visionMultiImageNote,
  visionSystemPrompt,
  visionUserText,
  PLANNER_SYSTEM_PROMPT,
  plannerUserText,
  CRITIC_SYSTEM_PROMPT,
  criticUserText,
} from "../prompts/llm";

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
const LLM_MODEL = process.env.LLM_MODEL || "openai/gpt-4o";
const TIMEOUT = 120_000;
const POLL_INTERVAL = 2_000;

export function isLLMAvailable(): boolean {
  return !!REPLICATE_TOKEN;
}

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

/**
 * Call a Replicate-hosted LLM via the predictions API.
 * Uses the `Prefer: wait` header for synchronous completion, with polling fallback.
 */
async function predict(input: Record<string, unknown>): Promise<string> {
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
): Promise<VisionAnalysis> {
  if (!isLLMAvailable()) return simulateVision(goal);
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

  const content = await predict({
    system_prompt: visionSystemPrompt(imageNote),
    prompt: visionUserText(goal, historySection, imageBuffers.length > 1),
    image_input: imageUris,
    temperature: 0.3,
    max_completion_tokens: 2000,
  });

  return parseJSON<VisionAnalysis>(content);
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
): Promise<Plan> {
  if (!isLLMAvailable()) return simulatePlan(goal, iteration);
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

  const content = await predict({
    system_prompt: PLANNER_SYSTEM_PROMPT,
    prompt: plannerUserText(
      goal,
      iteration,
      maxIterations,
      JSON.stringify(analysis),
      feedbackSection,
    ),
    temperature: 0.3,
    max_completion_tokens: 2000,
  });

  return parseJSON<Plan>(content);
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
): Promise<Critique> {
  if (!isLLMAvailable()) return simulateCritique(iteration, maxIterations);
  log("Calling critic…");

  const dataUri = await imageToDataUri(imageBuffer);

  const histSummary = history
    .filter((h) => h.type === "step")
    .map((h) => `[iter ${h.iteration}] ${h.step}: ${h.message}`)
    .join("\n");

  const content = await predict({
    system_prompt: CRITIC_SYSTEM_PROMPT,
    prompt: criticUserText(goal, iteration, maxIterations, histSummary),
    image_input: [dataUri],
    temperature: 0.3,
    max_completion_tokens: 2000,
  });

  return parseJSON<Critique>(content);
}

/* ------------------------------------------------------------------ */
/*  Simulation fallback (when REPLICATE_API_TOKEN is not set)          */
/* ------------------------------------------------------------------ */

function simulateVision(goal: string): VisionAnalysis {
  const gl = goal.toLowerCase();
  let desc =
    "Scene with a primary subject against a mixed background. Moderate lighting with some color cast.";
  const suggestions: string[] = [];

  if (gl.includes("headshot") || gl.includes("portrait") || gl.includes("linkedin")) {
    desc =
      "Portrait/headshot detected. Face centered, indoor background with moderate clutter, ambient lighting from left.";
    suggestions.push(
      "Enhance studio lighting",
      "Replace background with clean gradient",
      "Apply professional color grading",
    );
  } else if (gl.includes("cyberpunk") || gl.includes("neon") || gl.includes("digital art")) {
    desc =
      "Scene composition with urban elements and natural color palette. Geometric shapes suitable for style-transfer anchoring.";
    suggestions.push(
      "Shift to neon color palette",
      "Add volumetric atmosphere effects",
      "Generate cyberpunk detail overlays",
    );
  } else if (gl.includes("product") || gl.includes("e-commerce") || gl.includes("white background")) {
    desc =
      "Product image with main subject centered, complex background with shadows. Slight warm color cast.";
    suggestions.push(
      "Isolate product subject",
      "Replace with pure white background",
      "Correct color cast and add natural shadow",
    );
  } else {
    suggestions.push(
      "Analyze composition and focal points",
      "Enhance quality and color balance",
      "Apply creative adjustments aligned with goal",
    );
  }

  return {
    description: desc,
    objects: ["primary_subject", "background", "lighting_source"],
    quality: { score: 6.8, issues: ["moderate noise", "slight color cast", "could use more contrast"] },
    style: "casual photograph",
    relevanceToGoal: `Image provides a solid starting point for: "${goal.slice(0, 80)}"`,
    suggestions,
  };
}

function simulatePlan(goal: string, iteration: number): Plan {
  const gl = goal.toLowerCase();
  let steps: Plan["steps"];

  if (gl.includes("headshot") || gl.includes("portrait") || gl.includes("linkedin")) {
    steps = [
      { order: 1, action: "Lighting enhancement", description: "Adjust exposure and white balance for studio quality", tool: "sharp", parameters: { operation: "brightness", value: 1.15 } },
      { order: 2, action: "Contrast boost", description: "Increase contrast for professional punch", tool: "sharp", parameters: { operation: "contrast", value: 1.2 } },
      { order: 3, action: "Sharpening", description: "Sharpen details for crisp professional look", tool: "sharp", parameters: { operation: "sharpen", sigma: 1.5 } },
    ];
  } else if (gl.includes("cyberpunk") || gl.includes("neon") || gl.includes("digital art")) {
    steps = [
      { order: 1, action: "Saturate colors", description: "Boost saturation for vibrant neon palette", tool: "sharp", parameters: { operation: "saturation", value: 1.8 } },
      { order: 2, action: "Tint shift", description: "Apply cool blue-purple tint for cyberpunk feel", tool: "sharp", parameters: { operation: "tint", r: 100, g: 80, b: 220 } },
      { order: 3, action: "Sharpen details", description: "Sharpen for crisp digital art look", tool: "sharp", parameters: { operation: "sharpen", sigma: 2.0 } },
    ];
  } else if (gl.includes("product") || gl.includes("e-commerce")) {
    steps = [
      { order: 1, action: "Normalize levels", description: "Auto-level for neutral color balance", tool: "sharp", parameters: { operation: "normalize" } },
      { order: 2, action: "Brightness boost", description: "Brighten for clean product photography", tool: "sharp", parameters: { operation: "brightness", value: 1.2 } },
      { order: 3, action: "Sharpening", description: "Sharpen product details", tool: "sharp", parameters: { operation: "sharpen", sigma: 1.8 } },
    ];
  } else {
    steps = [
      { order: 1, action: "Normalize", description: "Auto-level and balance overall exposure", tool: "sharp", parameters: { operation: "normalize" } },
      { order: 2, action: "Enhance contrast", description: "Boost contrast for visual impact", tool: "sharp", parameters: { operation: "contrast", value: 1.15 } },
      { order: 3, action: "Sharpen", description: "Apply final sharpening pass", tool: "sharp", parameters: { operation: "sharpen", sigma: 1.5 } },
    ];
  }

  if (iteration > 1) {
    steps = steps.map((s) => ({
      ...s,
      action: s.action + " (refined)",
      description: s.description + " — adjusted based on critic feedback",
    }));
  }

  return {
    reasoning: `Plan tailored for goal "${goal.slice(0, 60)}" using ${steps.length} steps. ${iteration > 1 ? "Refined based on previous critique." : ""}`,
    steps,
  };
}

function simulateCritique(iteration: number, maxIterations: number): Critique {
  const score = iteration === 1 ? 6.2 + Math.random() * 1.5 : 8.5 + Math.random() * 1.2;
  const approved = score >= 8.0 || iteration >= maxIterations;

  return {
    score: +score.toFixed(1),
    feedback: approved
      ? "Result meets quality threshold. Output is visually cohesive and well-aligned with the stated goal."
      : "Promising result but needs refinement. Color balance and detail sharpness can be improved in the next iteration.",
    strengths: approved
      ? ["Good goal alignment", "Clean output", "Visually appealing"]
      : ["Solid foundation", "Composition preserved", "Core transformations applied"],
    weaknesses: approved
      ? []
      : ["Color temperature slightly off", "Could use more contrast in midtones", "Fine detail lost in some areas"],
    approved,
    improvements: approved
      ? undefined
      : ["Adjust color temperature", "Increase midtone contrast", "Apply targeted sharpening"],
  };
}
