import type { ModelAdapter, ModelInputParams } from "./types";

export class QwenImageEdit2511Adapter implements ModelAdapter {
  readonly id = "qwen/qwen-image-edit-2511";
  readonly name = "Qwen Image Edit 2511";
  readonly supportsReferenceImages = true;

  buildInput(params: ModelInputParams): Record<string, unknown> {
    const images = [params.primaryImageUrl, ...params.referenceImageUrls];
    return {
      prompt: params.prompt,
      image: images,
      aspect_ratio: "match_input_image",
      output_format: "jpg",
      output_quality: 95,
      go_fast: true,
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
