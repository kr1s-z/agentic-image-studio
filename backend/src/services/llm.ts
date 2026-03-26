import axios from "axios";
import sharp from "sharp";
import type { VisionAnalysis, Plan, Critique, WSMessage } from "../types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const TIMEOUT = 90_000;

export function isLLMAvailable(): boolean {
  return !!OPENAI_API_KEY;
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

async function chat(
  messages: unknown[],
  jsonMode: boolean = true,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    max_tokens: 2000,
    temperature: 0.3,
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await axios.post(`${OPENAI_BASE_URL}/chat/completions`, body, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: TIMEOUT,
  });
  return res.data.choices[0].message.content;
}

async function imageToBase64(
  buf: Buffer,
): Promise<{ base64: string; mime: string }> {
  const resized = await sharp(buf)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { base64: resized.toString("base64"), mime: "image/jpeg" };
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

  const encoded = await Promise.all(imageBuffers.map(imageToBase64));

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

  const imageNote =
    imageBuffers.length > 1
      ? ` You are given ${imageBuffers.length} images. The first is the primary image to transform. The rest are reference/style images provided by the user.`
      : "";

  const userContent: unknown[] = [
    {
      type: "text",
      text: `Analyze ${imageBuffers.length > 1 ? "these images" : "this image"}. The user's goal is: "${goal}".${historySection}\nReturn JSON only.`,
    },
    ...encoded.map(({ base64, mime }) => ({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${base64}` },
    })),
  ];

  const content = await chat([
    {
      role: "system",
      content: `You are an expert image analyst for an agentic image processing system.${imageNote}
Analyze the provided image(s) and return a JSON object with exactly these fields:
{
  "description": "Detailed description of image content, composition, and visual elements",
  "objects": ["list","of","detected","objects"],
  "quality": { "score": <1-10>, "issues": ["list of quality issues"] },
  "style": "Current visual style description",
  "relevanceToGoal": "How the current image relates to the user's goal",
  "suggestions": ["Specific actionable suggestions to achieve the goal"]
}
Respond with valid JSON only.`,
    },
    {
      role: "user",
      content: userContent,
    },
  ]);

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

  const content = await chat([
    {
      role: "system",
      content: `You are an expert image editing planner. Based on vision analysis and the user's goal, create a transformation plan.

Available tools:

TOOL "sharp" — local image processing. Each step needs an "operation" field:
  resize: { operation:"resize", width?:number, height?:number, fit?:"cover"|"contain"|"inside" }
  sharpen: { operation:"sharpen", sigma?:number(0.5-5) }
  blur: { operation:"blur", sigma?:number(0.5-10) }
  brightness: { operation:"brightness", value?:number(0.5-2.0, 1=no change) }
  contrast: { operation:"contrast", value?:number(0.5-2.0, 1=no change) }
  saturation: { operation:"saturation", value?:number(0.0-3.0, 1=no change) }
  hue: { operation:"hue", angle?:number(0-360) }
  grayscale: { operation:"grayscale" }
  normalize: { operation:"normalize" }
  gamma: { operation:"gamma", value?:number(1.0-3.0) }
  tint: { operation:"tint", r?:number, g?:number, b?:number }
  rotate: { operation:"rotate", angle?:number }
  flip: { operation:"flip" }
  flop: { operation:"flop" }
  negate: { operation:"negate" }
  median: { operation:"median", size?:number(3-7) }

TOOL "replicate" — AI image-to-image transformation (may not be available):
  { prompt: "description for AI model", strength?: number(0.1-0.9) }

Return JSON:
{
  "reasoning": "Brief explanation of approach",
  "steps": [
    { "order":1, "action":"Short name", "description":"What and why", "tool":"sharp"|"replicate", "parameters":{...} }
  ]
}
Create 2-5 steps. Be specific with parameter values. Respond with valid JSON only.`,
    },
    {
      role: "user",
      content: `Goal: "${goal}"
Iteration: ${iteration} of ${maxIterations}
Vision analysis: ${JSON.stringify(analysis)}${feedbackSection}

Create a plan. JSON only.`,
    },
  ]);

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

  const { base64, mime } = await imageToBase64(imageBuffer);

  const histSummary = history
    .filter((h) => h.type === "step")
    .map((h) => `[iter ${h.iteration}] ${h.step}: ${h.message}`)
    .join("\n");

  const content = await chat([
    {
      role: "system",
      content: `You are a quality critic for an agentic image processing system.
Evaluate the processed image against the user's goal and return JSON:
{
  "score": <0-10>,
  "feedback": "Detailed feedback",
  "strengths": ["What works well"],
  "weaknesses": ["What needs improvement"],
  "approved": <true if score >= 8 or goal sufficiently met>,
  "improvements": ["Suggestions if not approved"]
}

Consider goal alignment, technical quality, and aesthetic appeal.
Be honest: only approve if the result genuinely meets the goal.
Respond with valid JSON only.`,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Goal: "${goal}"
Iteration: ${iteration} of ${maxIterations}

Workflow so far:
${histSummary}

Evaluate the current result. JSON only.`,
        },
        {
          type: "image_url",
          image_url: { url: `data:${mime};base64,${base64}` },
        },
      ],
    },
  ]);

  return parseJSON<Critique>(content);
}

/* ------------------------------------------------------------------ */
/*  Simulation fallback (when OPENAI_API_KEY is not set)               */
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
