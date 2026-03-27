import type { ModelAdapter, ModelInputParams } from "./types";

class GenericFallback implements ModelAdapter {
  readonly name: string;

  constructor(readonly id: string) {
    this.name = id.split("/").pop() ?? id;
  }

  buildInput(params: ModelInputParams): Record<string, unknown> {
    return {
      image: params.primaryImageUrl,
      prompt: params.prompt,
      strength: params.strength,
      prompt_strength: params.strength,
    };
  }

  extractOutputUrl(output: unknown): string {
    if (Array.isArray(output)) return String(output[0]);
    if (typeof output === "string") return output;
    if (output && typeof output === "object" && "url" in output)
      return String((output as Record<string, unknown>).url);
    return String(output);
  }
}

class ModelRegistry {
  private adapters = new Map<string, ModelAdapter>();

  register(adapter: ModelAdapter): this {
    this.adapters.set(adapter.id, adapter);
    return this;
  }

  get(modelId: string): ModelAdapter {
    const exact = this.adapters.get(modelId);
    if (exact) return exact;

    for (const [key, adapter] of this.adapters) {
      if (modelId.includes(key.split("/").pop()!)) return adapter;
    }

    return new GenericFallback(modelId);
  }

  has(modelId: string): boolean {
    return this.adapters.has(modelId);
  }

  list(): ModelAdapter[] {
    return [...this.adapters.values()];
  }
}

export const modelRegistry = new ModelRegistry();
