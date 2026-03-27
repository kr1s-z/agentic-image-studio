import type { ModelAdapter, ModelInputParams } from "./types";

export class FluxProAdapter implements ModelAdapter {
  readonly id = "black-forest-labs/flux-1.1-pro";
  readonly name = "Flux 1.1 Pro";

  buildInput(params: ModelInputParams): Record<string, unknown> {
    const input: Record<string, unknown> = {
      prompt: params.prompt,
      aspect_ratio: "1:1",
      output_format: "webp",
      output_quality: 90,
      safety_tolerance: 5,
    };
    if (params.primaryImageUrl) {
      input.image_prompt = params.primaryImageUrl;
    }
    return input;
  }

  extractOutputUrl(output: unknown): string {
    if (typeof output === "string") return output;
    if (Array.isArray(output)) return String(output[0]);
    if (output && typeof output === "object" && "url" in output)
      return String((output as Record<string, unknown>).url);
    return String(output);
  }
}

export class FluxSchnellAdapter implements ModelAdapter {
  readonly id = "black-forest-labs/flux-schnell";
  readonly name = "Flux Schnell";

  buildInput(params: ModelInputParams): Record<string, unknown> {
    return {
      prompt: params.prompt,
      aspect_ratio: "1:1",
      output_format: "webp",
      output_quality: 90,
      num_outputs: 1,
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
