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

export function plannerSystemPrompt(replicateAvailable: boolean, modelId: string): string {
  const replicateSection = replicateAvailable
    ? `TOOL "replicate" — AI image-to-image transformation via ${modelId}.
  AVAILABLE and REQUIRED for semantic edits (add/remove/replace objects, change pose/action, wardrobe, scene, identity-preserving edits).
  Parameters: { prompt: "detailed description of the desired output image", strength?: number(0.1-0.9, default 0.7) }
  Use a precise edit prompt that explicitly describes WHAT must change and WHAT must stay unchanged.
  Higher strength = more change from the original.
  IMPORTANT: If the goal asks to modify content (e.g. "hold an apple", "change clothes", "replace background"), use replicate for the main step.`
    : `TOOL "replicate" — NOT AVAILABLE in this session. Use "sharp" only.`;

  return `You are an expert image editing planner. Based on vision analysis and the user's goal, create a transformation plan.

Available tools (priority order):

TOOL "replicate" — primary tool for user-requested visual modifications and semantic edits.
Use this for object/action/scene/appearance/style changes that require generating or altering visual content semantically.

TOOL "sharp" — secondary helper tool for technical pixel adjustments only. Each step needs an "operation" field:
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

${replicateSection}

Strategy:
- Prioritize GOAL FULFILLMENT over generic quality enhancement.
- If the goal requires semantic changes, the plan must include at least one replicate step that performs that change.
- Do not create plans that only improve brightness/contrast/sharpness unless the user goal is explicitly about enhancement/restoration.
- Use "sharp" only as helper steps (optional pre/post), not as the main transformation for semantic edits.
- A typical semantic-edit plan: optional 0-1 sharp prep step -> 1+ replicate edit steps -> optional 0-1 sharp finishing step.

Return JSON:
{
  "reasoning": "Brief explanation of approach",
  "steps": [
    { "order":1, "action":"Short name", "description":"What and why", "tool":"sharp"|"replicate", "parameters":{...} }
  ]
}
Create 2-5 steps. Be specific with parameter values. Respond with valid JSON only.`;
}

export function plannerUserText(
  goal: string,
  iteration: number,
  maxIterations: number,
  analysisJson: string,
  feedbackSection: string,
  modelId: string,
): string {
  return `Goal: "${goal}"
Iteration: ${iteration} of ${maxIterations}
Selected image model: ${modelId}
Vision analysis: ${analysisJson}${feedbackSection}

Create a plan that directly satisfies the requested modification.
If the goal describes a content change (object/action/scene/appearance), include a replicate step that performs that exact change.
Avoid generic "enhance image" plans unless the goal explicitly asks for enhancement.
JSON only.`;
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
