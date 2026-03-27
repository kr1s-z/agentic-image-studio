/**
 * Resolves API keys from environment.
 * Replicate uses a single shared token for all models.
 */

function pick(...candidates: (string | undefined)[]): string | undefined {
  for (const c of candidates) {
    const v = c?.trim();
    if (v) return v;
  }
  return undefined;
}

/** OpenAI API key for vision, planning, and critic (chat completions). */
export function openaiApiKey(): string | undefined {
  return pick(process.env.OPENAI_API_KEY);
}

/** Replicate bearer token used for all models. */
export function resolveReplicateToken(_modelId?: string): string | undefined {
  return pick(process.env.REPLICATE_API_TOKEN);
}

export function isReplicateConfigured(): boolean {
  return !!pick(process.env.REPLICATE_API_TOKEN);
}
