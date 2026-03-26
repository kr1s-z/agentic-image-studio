import sharp from "sharp";
import axios from "axios";
import path from "path";
import fs from "fs";
import type { PlanStep } from "../types";

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
const UPLOADS_DIR = path.join(__dirname, "../../uploads");

if (!fs.existsSync(UPLOADS_DIR))
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function log(msg: string): void {
  console.log(`[imaging] ${msg}`);
}

export function isReplicateAvailable(): boolean {
  return !!REPLICATE_TOKEN;
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
/*  Replicate — model-aware img-to-img                                 */
/* ------------------------------------------------------------------ */

function buildReplicateInput(
  model: string,
  b64: string,
  prompt: string,
  strength: number,
): Record<string, unknown> {
  const imageData = `data:image/jpeg;base64,${b64}`;

  if (model.includes("flux")) {
    return {
      prompt,
      image: imageData,
      prompt_strength: strength,
      num_outputs: 1,
      output_format: "jpg",
    };
  }

  if (model.includes("sdxl") || model.includes("stability")) {
    return {
      image: imageData,
      prompt,
      prompt_strength: strength,
      num_inference_steps: 30,
      guidance_scale: 7.5,
    };
  }

  return {
    image: imageData,
    prompt,
    strength,
    prompt_strength: strength,
  };
}

export async function replicateTransform(
  buf: Buffer,
  prompt: string,
  strength: number = 0.7,
  model: string = "stability-ai/sdxl",
): Promise<Buffer> {
  if (!REPLICATE_TOKEN) throw new Error("REPLICATE_API_TOKEN not set");

  const resized = await sharp(buf)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const b64 = resized.toString("base64");
  const input = buildReplicateInput(model, b64, prompt, strength);

  log(`Calling Replicate model=${model} (prompt: "${prompt.slice(0, 60)}…")`);

  const { data: prediction } = await axios.post(
    "https://api.replicate.com/v1/predictions",
    { model, input },
    {
      headers: {
        Authorization: `Bearer ${REPLICATE_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      timeout: 120_000,
    },
  );

  let result = prediction;

  if (result.status !== "succeeded") {
    for (let i = 0; i < 60 && result.status !== "succeeded"; i++) {
      if (result.status === "failed" || result.status === "canceled") {
        throw new Error(`Replicate prediction ${result.status}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
      const { data } = await axios.get(
        `https://api.replicate.com/v1/predictions/${result.id}`,
        { headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` } },
      );
      result = data;
    }
  }

  if (!result.output) throw new Error("Replicate prediction timed out");

  const imgUrl = Array.isArray(result.output)
    ? result.output[0]
    : result.output;
  const { data: imgData } = await axios.get(imgUrl, {
    responseType: "arraybuffer",
    timeout: 30_000,
  });
  return Buffer.from(imgData);
}

/* ------------------------------------------------------------------ */
/*  Execute a single plan step                                         */
/* ------------------------------------------------------------------ */

export async function executePlanStep(
  buf: Buffer,
  planStep: PlanStep,
  model: string,
): Promise<Buffer> {
  if (planStep.tool === "replicate" && isReplicateAvailable()) {
    try {
      return await replicateTransform(
        buf,
        (planStep.parameters.prompt as string) || planStep.description,
        (planStep.parameters.strength as number) ?? 0.7,
        model,
      );
    } catch (err) {
      log(
        `Replicate failed for "${planStep.action}", falling back to sharp: ${err}`,
      );
    }
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
