/**
 * Resolves API keys and config from environment.
 * Everything runs through Replicate — one token for image models and LLM.
 */

function pick(...candidates: (string | undefined)[]): string | undefined {
  for (const c of candidates) {
    const v = c?.trim();
    if (v) return v;
  }
  return undefined;
}

/** Replicate bearer token used for all models (image + LLM). */
export function resolveReplicateToken(_modelId?: string): string | undefined {
  return pick(process.env.REPLICATE_API_TOKEN);
}

export function isReplicateConfigured(): boolean {
  return !!pick(process.env.REPLICATE_API_TOKEN);
}

/** Which Replicate-hosted model to use for vision/planning/critic reasoning. */
export function llmModel(): string {
  return process.env.LLM_MODEL || "openai/gpt-4o";
}
