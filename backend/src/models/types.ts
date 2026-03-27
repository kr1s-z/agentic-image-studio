export interface ModelInputParams {
  prompt: string;
  primaryImageUrl: string;
  referenceImageUrls: string[];
  strength: number;
}

export interface ModelAdapter {
  /** Replicate model identifier, e.g. "google/nano-banana-2" */
  readonly id: string;
  /** Human-readable name shown in logs and traces */
  readonly name: string;

  /** Build the model-specific `input` payload for the Replicate prediction API */
  buildInput(params: ModelInputParams): Record<string, unknown>;

  /** Extract the downloadable image URL from the Replicate prediction output */
  extractOutputUrl(output: unknown): string;
}
