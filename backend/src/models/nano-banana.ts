import type { ModelAdapter, ModelInputParams } from "./types";

export class NanoBanana2Adapter implements ModelAdapter {
  readonly id = "google/nano-banana-2";
  readonly name = "Nano Banana 2";

  buildInput(params: ModelInputParams): Record<string, unknown> {
    const imageInput = [
      params.primaryImageUrl,
      ...params.referenceImageUrls,
    ];

    return {
      prompt: params.prompt,
      image_input: imageInput,
      resolution: "1K",
      aspect_ratio: "match_input_image",
      output_format: "jpg",
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
