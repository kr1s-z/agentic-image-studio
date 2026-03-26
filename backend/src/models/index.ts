export type { ModelAdapter, ModelInputParams } from "./types";
export { modelRegistry } from "./registry";

import { modelRegistry } from "./registry";
import { FluxProAdapter, FluxSchnellAdapter } from "./flux";
import { NanoBanana2Adapter } from "./nano-banana";

modelRegistry
  .register(new FluxProAdapter())
  .register(new FluxSchnellAdapter())
  .register(new NanoBanana2Adapter());
