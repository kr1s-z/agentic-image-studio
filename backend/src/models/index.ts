export type { ModelAdapter, ModelInputParams } from "./types";
export { modelRegistry } from "./registry";

import { modelRegistry } from "./registry";
import { NanoBanana2Adapter } from "./nano-banana";
import { QwenImageEdit2511Adapter } from "./qwen-image-edit";

modelRegistry
  .register(new QwenImageEdit2511Adapter())
  .register(new NanoBanana2Adapter());
