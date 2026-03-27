import sharp from "sharp";
import axios from "axios";
import path from "path";
import fs from "fs";
import FormData from "form-data";
import type { PlanStep } from "../types";
import { modelRegistry } from "../models";
import { isReplicateConfigured, resolveReplicateToken } from "../config/env";

const UPLOADS_DIR = path.join(__dirname, "../../uploads");
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 2_000;

if (!fs.existsSync(UPLOADS_DIR))
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function log(msg: string): void {
  console.log(`[imaging] ${msg}`);
}

function isRetryable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function retryDelay(attempt: number): number {
  return RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 1_000;
}

export function isReplicateAvailable(): boolean {
  return isReplicateConfigured();
}

/* ------------------------------------------------------------------ */
/*  Sharp operations                                                   */
/* ------------------------------------------------------------------ */

export async function applySharpOperation(
  buf: Buffer,
  params: Record<string, unknown>,
): Promise<Buffer> {
  const op = (params.operation as string) || "normalize";
  let pipeline = sharp(buf);

  switch (op) {
    case "resize":
      pipeline = pipeline.resize(
        (params.width as number) || undefined,
        (params.height as number) || undefined,
        { fit: (params.fit as keyof sharp.FitEnum) || "inside" },
      );
      break;
    case "sharpen":
      pipeline = pipeline.sharpen({ sigma: (params.sigma as number) ?? 1.5 });
      break;
    case "blur":
      pipeline = pipeline.blur((params.sigma as number) ?? 1.5);
      break;
    case "brightness":
      pipeline = pipeline.modulate({
        brightness: (params.value as number) ?? 1.2,
      });
      break;
    case "contrast": {
      const c = (params.value as number) ?? 1.2;
      pipeline = pipeline.linear(c, 128 * (1 - c));
      break;
    }
    case "saturation":
      pipeline = pipeline.modulate({
        saturation: (params.value as number) ?? 1.3,
      });
      break;
    case "hue":
      pipeline = pipeline.modulate({
        hue: (params.angle as number) ?? 0,
      });
      break;
    case "grayscale":
      pipeline = pipeline.grayscale();
      break;
    case "normalize":
      pipeline = pipeline.normalize();
      break;
    case "gamma":
      pipeline = pipeline.gamma((params.value as number) ?? 2.2);
      break;
    case "tint":
      pipeline = pipeline.tint({
        r: (params.r as number) ?? 255,
        g: (params.g as number) ?? 200,
        b: (params.b as number) ?? 150,
      });
      break;
    case "rotate":
      pipeline = pipeline.rotate((params.angle as number) ?? 0);
      break;
    case "flip":
      pipeline = pipeline.flip();
      break;
    case "flop":
      pipeline = pipeline.flop();
      break;
    case "negate":
      pipeline = pipeline.negate();
      break;
    case "median":
      pipeline = pipeline.median((params.size as number) ?? 3);
      break;
    default:
      log(`Unknown sharp operation "${op}", skipping`);
  }

  return pipeline.toBuffer();
}

/* ------------------------------------------------------------------ */
/*  Replicate — delegates to model adapters via registry               */
/* ------------------------------------------------------------------ */

async function prepareImage(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Upload a buffer to Replicate's files API and return a serving URL.
 * This avoids base64 data-URI issues with models that expect real URLs.
 */
async function uploadToReplicate(buf: Buffer, token: string): Promise<string> {
  const prepared = await prepareImage(buf);
  const form = new FormData();
  form.append("content", prepared, {
    filename: "input.jpg",
    contentType: "image/jpeg",
  });

  const { data } = await axios.post(
    "https://api.replicate.com/v1/files",
    form,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
      timeout: 30_000,
    },
  );
  return data.urls?.get ?? data.url;
}

function extractErrorDetail(err: unknown): string {
  if (!axios.isAxiosError(err)) return String(err);
  const status = err.response?.status;
  const body = err.response?.data;
  const detail = typeof body === "object" && body !== null
    ? JSON.stringify(body).slice(0, 500)
    : String(body ?? "");
  return `HTTP ${status}: ${detail}`;
}

export async function replicateTransform(
  buf: Buffer,
  prompt: string,
  strength: number = 0.7,
  model: string = "stability-ai/sdxl",
  referenceImages: Buffer[] = [],
): Promise<Buffer> {
  const adapter = modelRegistry.get(model);
  const token = resolveReplicateToken(adapter.id);
  if (!token) {
    throw new Error(
      "No Replicate API token: set REPLICATE_API_TOKEN",
    );
  }

  const useRefs = !!adapter.supportsReferenceImages;
  const refsToUpload = useRefs ? referenceImages : [];
  if (!useRefs && referenceImages.length > 0) {
    log(`Model ${adapter.id} supports a single image input; ignoring ${referenceImages.length} reference image(s)`);
  }

  log(`Uploading ${1 + refsToUpload.length} image(s) to Replicate files API…`);
  const primaryUrl = await uploadToReplicate(buf, token);
  const refUrls = await Promise.all(
    refsToUpload.map((img) => uploadToReplicate(img, token)),
  );

  const input = adapter.buildInput({
    prompt,
    primaryImageUrl: primaryUrl,
    referenceImageUrls: refUrls,
    strength,
  });

  log(`Calling Replicate model=${adapter.id} (${adapter.name}) — prompt: "${prompt.slice(0, 60)}…"`);

  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const wait = retryDelay(attempt - 1);
      log(`Rate limited — retrying in ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
      await new Promise((r) => setTimeout(r, wait));
    }

    try {
      const { data: prediction } = await axios.post(
        `https://api.replicate.com/v1/models/${adapter.id}/predictions`,
        { input },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Prefer: "wait",
          },
          timeout: 120_000,
        },
      );

      let result = prediction;

      while (
        result.status !== "succeeded" &&
        result.status !== "failed" &&
        result.status !== "canceled"
      ) {
        await new Promise((r) => setTimeout(r, 2000));
        const { data } = await axios.get(
          `https://api.replicate.com/v1/predictions/${result.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        result = data;
      }

      if (result.status !== "succeeded") {
        throw new Error(`Replicate prediction ${result.status}: ${result.error || ""}`);
      }

      if (!result.output) throw new Error("Replicate prediction returned no output");
      log(`Replicate prediction succeeded: id=${result.id} model=${adapter.id}`);

      const imgUrl = adapter.extractOutputUrl(result.output);
      log(`Replicate output URL received for model=${adapter.id}`);
      const { data: imgData } = await axios.get(imgUrl, {
        responseType: "arraybuffer",
        timeout: 30_000,
      });
      return Buffer.from(imgData);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) {
        log(`Replicate error: ${extractErrorDetail(err)}`);
        throw err;
      }
    }
  }

  throw lastErr;
}

/* ------------------------------------------------------------------ */
/*  Execute a single plan step                                         */
/* ------------------------------------------------------------------ */

export async function executePlanStep(
  buf: Buffer,
  planStep: PlanStep,
  model: string,
  referenceImages: Buffer[] = [],
): Promise<Buffer> {
  if (planStep.tool === "replicate") {
    return replicateTransform(
      buf,
      (planStep.parameters.prompt as string) || planStep.description,
      (planStep.parameters.strength as number) ?? 0.7,
      model,
      referenceImages,
    );
  }

  return applySharpOperation(buf, planStep.parameters);
}

/* ------------------------------------------------------------------ */
/*  Persist an intermediate image to disk and return its URL           */
/* ------------------------------------------------------------------ */

export async function saveImage(
  jobId: string,
  buf: Buffer,
  tag: string,
): Promise<string> {
  const filename = `${jobId}_${tag}.jpg`;
  const filepath = path.join(UPLOADS_DIR, filename);
  const jpgBuf = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
  fs.writeFileSync(filepath, jpgBuf);
  return `/api/uploads/${filename}`;
}
