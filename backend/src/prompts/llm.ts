/**
 * Centralized LLM system and user prompts for vision, planning, and critique.
 * Edit here to tune agent behavior without touching orchestration code.
 */

/* ---- Vision ---- */

export function visionMultiImageNote(imageCount: number): string {
  if (imageCount <= 1) return "";
  return ` You are given ${imageCount} images. The first is the primary image to transform. The rest are reference/style images provided by the user.`;
}

export function visionSystemPrompt(multiImageNote: string): string {
  return `You are an expert image analyst for an agentic image processing system.${multiImageNote}
Analyze the provided image(s) and return a JSON object with exactly these fields:
{
  "description": "Detailed description of image content, composition, and visual elements",
  "objects": ["list","of","detected","objects"],
  "quality": { "score": <1-10>, "issues": ["list of quality issues"] },
  "style": "Current visual style description",
  "relevanceToGoal": "How the current image relates to the user's goal",
  "suggestions": ["Specific actionable suggestions to achieve the goal"]
}
Respond with valid JSON only.`;
}

export function visionUserText(
  goal: string,
  historySection: string,
  multipleImages: boolean,
): string {
  const subject = multipleImages ? "these images" : "this image";
  return `Analyze ${subject}. The user's goal is: "${goal}".${historySection}\nReturn JSON only.`;
}

/* ---- Planning ---- */

export const PLANNER_SYSTEM_PROMPT = `You are an expert image editing planner. Based on vision analysis and the user's goal, create a transformation plan.

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
Create 2-5 steps. Be specific with parameter values. Respond with valid JSON only.`;

export function plannerUserText(
  goal: string,
  iteration: number,
  maxIterations: number,
  analysisJson: string,
  feedbackSection: string,
): string {
  return `Goal: "${goal}"
Iteration: ${iteration} of ${maxIterations}
Vision analysis: ${analysisJson}${feedbackSection}

Create a plan. JSON only.`;
}

/* ---- Critic ---- */

export const CRITIC_SYSTEM_PROMPT = `You are a quality critic for an agentic image processing system.
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
Respond with valid JSON only.`;

export function criticUserText(
  goal: string,
  iteration: number,
  maxIterations: number,
  histSummary: string,
): string {
  return `Goal: "${goal}"
Iteration: ${iteration} of ${maxIterations}

Workflow so far:
${histSummary}

Evaluate the current result. JSON only.`;
}
