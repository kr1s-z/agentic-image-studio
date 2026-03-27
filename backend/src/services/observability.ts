import {
  Langfuse,
  type LangfuseTraceClient,
  type LangfuseSpanClient,
  type LangfuseGenerationClient,
} from "langfuse";
import crypto from "crypto";

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
  return error instanceof Error ? error.message : String(error);
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
  const sha256Hash = crypto.createHash("sha256").update(args.buffer).digest("hex");

  const { mediaId, uploadUrl } = await lf.api.mediaGetUploadUrl({
    traceId: args.jobId,
    field: args.field,
    contentType: contentType as any,
    contentLength: args.buffer.length,
    sha256Hash,
  });

  if (uploadUrl) {
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: args.buffer,
    });
    await lf.api.mediaPatch(mediaId, {
      uploadedAt: new Date().toISOString(),
      uploadHttpStatus: uploadRes.status,
      uploadHttpError: uploadRes.ok ? undefined : uploadRes.statusText,
      uploadTimeMs: Date.now() - startedAt,
    });
    if (!uploadRes.ok) {
      throw new Error(`Langfuse media upload failed (${uploadRes.status}): ${uploadRes.statusText}`);
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
  }).catch((err) => {
    log(`Failed to upload original image ${index} to Langfuse: ${safeError(err)}`);
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
  }).catch((err) => {
    log(`Failed to upload final image to Langfuse: ${safeError(err)}`);
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
