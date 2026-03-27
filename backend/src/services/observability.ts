import {
  Langfuse,
  type LangfuseTraceClient,
  type LangfuseSpanClient,
  type LangfuseGenerationClient,
} from "langfuse";
import crypto from "crypto";
import axios from "axios";

type SpanHandle = {
  end: (output?: unknown) => void;
  fail: (error: unknown) => void;
};

const NOOP_SPAN: SpanHandle = {
  end: () => {},
  fail: () => {},
};

const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY?.trim();
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY?.trim();
const LANGFUSE_BASE_URL = process.env.LANGFUSE_BASE_URL?.trim();
const LANGFUSE_ENABLED = !!(LANGFUSE_PUBLIC_KEY && LANGFUSE_SECRET_KEY);

let client: Langfuse | null = null;
const traces = new Map<string, LangfuseTraceClient>();

function log(msg: string): void {
  console.log(`[observability] ${msg}`);
}

function safeError(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "status" in (error as any) &&
    "statusText" in (error as any)
  ) {
    const e = error as any;
    const method = typeof e.method === "string" ? e.method : "";
    const url = typeof e.url === "string" ? e.url : "";
    const extra = [method, url].filter(Boolean).join(" ");
    return `HTTP ${e.status}${e.statusText ? ` ${e.statusText}` : ""}${extra ? ` (${extra})` : ""}`;
  }
  if (
    error &&
    typeof error === "object" &&
    "response" in (error as any) &&
    (error as any).response
  ) {
    const r = (error as any).response;
    const status = r?.status;
    const statusText = r?.statusText;
    const data = r?.data;
    const detail =
      typeof data === "string" ? data : data ? JSON.stringify(data) : "";
    return `HTTP ${status ?? "unknown"}${statusText ? ` ${statusText}` : ""}${detail ? `: ${detail}` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function describeResponse(res: Response): Promise<string> {
  let body = "";
  try {
    body = (await res.text()).trim();
  } catch {
    body = "";
  }
  if (body.length > 600) body = `${body.slice(0, 600)}…`;
  return `HTTP ${res.status} ${res.statusText}${res.url ? ` (${res.url})` : ""}${body ? `: ${body}` : ""}`;
}

async function describeError(error: unknown): Promise<string> {
  if (error instanceof Response) {
    return describeResponse(error);
  }
  return safeError(error);
}

function getClient(): Langfuse | null {
  if (!LANGFUSE_ENABLED) return null;
  if (!client) {
    client = new Langfuse({
      publicKey: LANGFUSE_PUBLIC_KEY,
      secretKey: LANGFUSE_SECRET_KEY,
      baseUrl: LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
    });
    log(`Langfuse enabled (${LANGFUSE_BASE_URL || "https://cloud.langfuse.com"})`);
  }
  return client;
}

function getOrCreateTrace(jobId: string): LangfuseTraceClient | null {
  const lf = getClient();
  if (!lf) return null;

  const existing = traces.get(jobId);
  if (existing) return existing;

  const trace = lf.trace({
    id: jobId,
    name: "agentic-image-workflow",
    metadata: { jobId },
  });
  traces.set(jobId, trace);
  return trace;
}

function safeFlush(): void {
  const lf = getClient();
  if (!lf) return;
  void lf.flushAsync().catch(() => {});
}

async function uploadTraceImage(args: {
  jobId: string;
  field: "input" | "output" | "metadata";
  contentType: string;
  buffer: Buffer;
  label: string;
}): Promise<void> {
  const lf = getClient();
  if (!lf) return;

  const contentType = args.contentType || "image/jpeg";
  const startedAt = Date.now();
  // Langfuse API expects standard base64-encoded SHA-256 (44 chars).
  const sha256Hash = crypto
    .createHash("sha256")
    .update(args.buffer)
    .digest("base64")
    .replace(/\s+/g, "");

  let mediaId: string;
  let uploadUrl: string | null | undefined;
  try {
    const res = await lf.api.mediaGetUploadUrl({
      traceId: args.jobId,
      field: args.field,
      contentType: contentType as any,
      contentLength: args.buffer.length,
      sha256Hash,
    });
    mediaId = res.mediaId;
    uploadUrl = res.uploadUrl;
  } catch (err) {
    const msg = await describeError(err);
    throw new Error(
      `Langfuse mediaGetUploadUrl failed: ${msg} (sha256Hash.length=${sha256Hash.length})`,
    );
  }

  if (uploadUrl) {
    let uploadStatus = 0;
    let uploadStatusText = "";
    let uploadError = "";
    try {
      // Signed S3 URLs may require exact headers that are part of SignedHeaders.
      // Explicitly set checksum + length to avoid SignatureDoesNotMatch.
      const uploadRes = await axios.put(uploadUrl, args.buffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(args.buffer.length),
          "x-amz-checksum-sha256": sha256Hash,
        },
        timeout: 60_000,
        maxBodyLength: Infinity,
        validateStatus: () => true,
      });
      uploadStatus = uploadRes.status;
      uploadStatusText = uploadRes.statusText || "";
      if (uploadStatus < 200 || uploadStatus >= 300) {
        const body =
          typeof uploadRes.data === "string"
            ? uploadRes.data
            : JSON.stringify(uploadRes.data ?? "");
        uploadError = body.slice(0, 600);
      }
    } catch (err) {
      uploadError = safeError(err);
    }
    try {
      await lf.api.mediaPatch(mediaId, {
        uploadedAt: new Date().toISOString(),
        uploadHttpStatus: uploadStatus,
        uploadHttpError: uploadError || (uploadStatus >= 200 && uploadStatus < 300 ? undefined : uploadStatusText),
        uploadTimeMs: Date.now() - startedAt,
      });
    } catch (err) {
      const msg = await describeError(err);
      throw new Error(`Langfuse mediaPatch failed: ${msg}`);
    }
    if (uploadStatus < 200 || uploadStatus >= 300) {
      throw new Error(
        `Langfuse media upload failed: HTTP ${uploadStatus}${uploadStatusText ? ` ${uploadStatusText}` : ""}${uploadError ? `: ${uploadError}` : ""}`,
      );
    }
  }

  const trace = getOrCreateTrace(args.jobId);
  if (!trace) return;
  trace.update({
    metadata: {
      [`${args.label}MediaId`]: mediaId,
    },
  });
  safeFlush();
}

export function isObservabilityEnabled(): boolean {
  return LANGFUSE_ENABLED;
}

export function startJobTrace(args: {
  jobId: string;
  goal: string;
  model: string;
  imageCount: number;
  maxIterations: number;
}): void {
  const trace = getOrCreateTrace(args.jobId);
  if (!trace) return;

  trace.update({
    input: { goal: args.goal, model: args.model, imageCount: args.imageCount },
    metadata: { maxIterations: args.maxIterations },
    tags: ["agentic-image-studio", args.model],
  });
  safeFlush();
}

export function attachOriginalImageToTrace(
  jobId: string,
  buffer: Buffer,
  contentType: string,
  index: number,
): void {
  void uploadTraceImage({
    jobId,
    field: "input",
    contentType,
    buffer,
    label: `original_${index}`,
  }).catch(async (err) => {
    const msg = await describeError(err);
    log(`Failed to upload original image ${index} to Langfuse: ${msg}`);
  });
}

export function attachFinalImageToTrace(
  jobId: string,
  buffer: Buffer,
  contentType: string,
): void {
  void uploadTraceImage({
    jobId,
    field: "output",
    contentType,
    buffer,
    label: "final",
  }).catch(async (err) => {
    const msg = await describeError(err);
    log(`Failed to upload final image to Langfuse: ${msg}`);
  });
}

export function completeJobTrace(jobId: string, output: Record<string, unknown>): void {
  const trace = getOrCreateTrace(jobId);
  if (!trace) return;
  trace.update({ output, metadata: { status: "completed" } });
  safeFlush();
}

export function failJobTrace(jobId: string, error: unknown): void {
  const trace = getOrCreateTrace(jobId);
  if (!trace) return;
  trace.update({
    output: { error: safeError(error) },
    metadata: { status: "failed" },
  });
  safeFlush();
}

export function cancelJobTrace(jobId: string): void {
  const trace = getOrCreateTrace(jobId);
  if (!trace) return;
  trace.update({ metadata: { status: "cancelled" } });
  safeFlush();
}

export function scoreJobTrace(
  jobId: string,
  score: 0 | 1,
  comment?: string,
): void {
  const trace = getOrCreateTrace(jobId);
  if (!trace) return;
  trace.score({
    name: "user_feedback",
    value: score,
    dataType: "BOOLEAN",
    comment,
  } as any);
  trace.update({
    metadata: {
      userFeedback: score === 1 ? "thumbs_up" : "thumbs_down",
      userFeedbackComment: comment || null,
    },
  });
  safeFlush();
}

function startSpanInternal(
  jobId: string,
  name: string,
  input?: unknown,
  metadata?: Record<string, unknown>,
): LangfuseSpanClient | null {
  const trace = getOrCreateTrace(jobId);
  if (!trace) return null;
  return trace.span({ name, input, metadata });
}

export function startSpan(
  jobId: string,
  name: string,
  input?: unknown,
  metadata?: Record<string, unknown>,
): SpanHandle {
  const span = startSpanInternal(jobId, name, input, metadata);
  if (!span) return NOOP_SPAN;

  return {
    end: (output?: unknown) => {
      span.end({ output } as any);
    },
    fail: (error: unknown) => {
      span.end({
        output: { error: safeError(error) },
        level: "ERROR",
        statusMessage: safeError(error),
      } as any);
    },
  };
}

export function startGeneration(
  jobId: string,
  name: string,
  model: string,
  input?: unknown,
  metadata?: Record<string, unknown>,
): SpanHandle {
  const trace = getOrCreateTrace(jobId);
  if (!trace) return NOOP_SPAN;

  const gen: LangfuseGenerationClient = trace.generation({
    name,
    model,
    input,
    metadata,
  } as any);

  return {
    end: (output?: unknown) => {
      gen.end({ output } as any);
    },
    fail: (error: unknown) => {
      gen.end({
        output: { error: safeError(error) },
        level: "ERROR",
        statusMessage: safeError(error),
      } as any);
    },
  };
}
