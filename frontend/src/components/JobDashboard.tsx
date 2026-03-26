import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Clock,
  Hash,
  XCircle,
  RefreshCw,
  Download,
  RotateCcw,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { WSMessage, JobStatus } from "../types";
import { useWebSocket } from "../hooks/useWebSocket";
import AgentTrace from "./AgentTrace";
import ImagePreview from "./ImagePreview";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

interface Props {
  jobId: string;
  originalImages: string[];
  goal: string;
  model: string;
  onReset: () => void;
}

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Pending",
  running: "Running",
  iterating: "Iterating",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<JobStatus, string> = {
  pending: "text-zinc-400",
  running: "text-blue-400",
  iterating: "text-purple-400",
  completed: "text-green-400",
  failed: "text-red-400",
  cancelled: "text-zinc-500",
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function JobDashboard({
  jobId,
  originalImages,
  goal,
  model,
  onReset,
}: Props) {
  const originalImage = originalImages[0] ?? "";
  const { connected, trace, connect, disconnect } = useWebSocket(jobId);
  const [elapsed, setElapsed] = useState(0);

  const currentStatus = useMemo<JobStatus>(() => {
    for (let i = trace.length - 1; i >= 0; i--) {
      const m = trace[i];
      if (m.type === "completed") return "completed";
      if (m.type === "error") return "failed";
      if (m.type === "status" && m.status) return m.status as JobStatus;
    }
    return "pending";
  }, [trace]);

  const currentImage = useMemo(() => {
    for (let i = trace.length - 1; i >= 0; i--) {
      const m = trace[i];
      if (m.type === "completed" && m.finalImageUrl) return m.finalImageUrl;
      if (m.type === "step" && m.step === "execute" && m.imageUrl)
        return m.imageUrl;
    }
    return null;
  }, [trace]);

  const progress = useMemo(() => {
    if (currentStatus === "completed") return 100;
    for (let i = trace.length - 1; i >= 0; i--) {
      if (trace[i].type === "status" && trace[i].progress != null)
        return trace[i].progress!;
    }
    return 0;
  }, [trace, currentStatus]);

  const currentIteration = useMemo(() => {
    let max = 1;
    for (const m of trace) {
      if (m.iteration && m.iteration > max) max = m.iteration;
    }
    return max;
  }, [trace]);

  const completion = useMemo<WSMessage | null>(() => {
    return trace.find((m) => m.type === "completed") ?? null;
  }, [trace]);

  const errorMsg = useMemo<string | null>(() => {
    const err = trace.find((m) => m.type === "error");
    return err?.message ?? null;
  }, [trace]);

  const isTerminal =
    currentStatus === "completed" ||
    currentStatus === "failed" ||
    currentStatus === "cancelled";

  useEffect(() => {
    if (isTerminal) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [isTerminal]);

  const handleCancel = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/jobs/${jobId}/cancel`, { method: "POST" });
    } catch {
      /* ignore */
    }
  }, [jobId]);

  const handleExportTrace = useCallback(() => {
    const blob = new Blob([JSON.stringify(trace, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trace-${jobId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [trace, jobId]);

  const handleNewJob = useCallback(() => {
    disconnect();
    onReset();
  }, [disconnect, onReset]);

  return (
    <div className="h-screen flex flex-col">
      {/* Top Bar */}
      <header className="flex-none border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={handleNewJob}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors"
              aria-label="Back to home"
            >
              <ArrowLeft size={18} />
            </button>

            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-500">
              <Hash size={12} />
              <span className="font-mono truncate max-w-[160px]">
                {jobId.slice(0, 8)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {currentStatus === "completed" ? (
                <CheckCircle2 size={14} className="text-green-400" />
              ) : currentStatus === "failed" ? (
                <AlertTriangle size={14} className="text-red-400" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              )}
              <span
                className={`text-sm font-semibold ${STATUS_COLORS[currentStatus]}`}
              >
                {STATUS_LABELS[currentStatus]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* Progress */}
            {!isTerminal && (
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {progress}%
                </span>
              </div>
            )}

            {/* Iteration counter */}
            {currentIteration > 1 && (
              <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-1 rounded">
                Iter {currentIteration}
              </span>
            )}

            {/* Elapsed time */}
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <Clock size={12} />
              <span className="font-mono">{formatElapsed(elapsed)}</span>
            </div>

            {/* Cancel button */}
            {!isTerminal && (
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <XCircle size={12} />
                <span className="hidden sm:inline">Cancel</span>
              </button>
            )}
          </div>
        </div>

        {/* Goal + model banner */}
        <div className="flex items-center gap-3 px-4 sm:px-6 pb-3">
          <p className="text-xs text-zinc-500 truncate flex-1 min-w-0">
            <span className="text-zinc-600">Goal: </span>
            {goal}
          </p>
          {model && (
            <span className="shrink-0 text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md font-medium">
              {model.split("/").pop()}
            </span>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800">
        {/* Agent Trace panel */}
        <div className="lg:col-span-2 relative min-h-0 overflow-hidden order-2 lg:order-1">
          <AgentTrace
            trace={trace}
            connected={connected}
            onReconnect={connect}
          />
        </div>

        {/* Image + status panel */}
        <div className="lg:col-span-3 p-4 sm:p-6 overflow-y-auto space-y-6 order-1 lg:order-2">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1">
              <h3 className="text-sm font-semibold text-zinc-200">
                {isTerminal ? "Result" : "Live Preview"}
              </h3>
              <p className="text-xs text-zinc-500">
                {isTerminal
                  ? "Final output from the agentic workflow"
                  : "Updates as agents process your image"}
              </p>
            </div>
            {currentImage && !isTerminal && (
              <div className="flex items-center gap-1 text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-lg">
                <RefreshCw size={10} className="animate-spin" />
                Processing
              </div>
            )}
          </div>

          {/* Image preview */}
          <ImagePreview
            originalUrl={originalImage}
            currentUrl={currentImage}
            isCompleted={currentStatus === "completed"}
          />

          {/* Completion summary */}
          {completion && (
            <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5 space-y-4 animate-trace-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-green-400" />
                <h3 className="text-sm font-semibold text-green-300">
                  Workflow Complete
                </h3>
              </div>

              <p className="text-sm text-zinc-300 leading-relaxed">
                {completion.summary}
              </p>

              <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
                {completion.iterations && (
                  <span className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700">
                    {completion.iterations} iteration(s)
                  </span>
                )}
                {completion.totalSteps && (
                  <span className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700">
                    {completion.totalSteps} total steps
                  </span>
                )}
                {typeof completion.finalScore === "number" &&
                  completion.finalScore > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700">
                      Final score: {completion.finalScore}/10
                    </span>
                  )}
                <span className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700">
                  {formatElapsed(elapsed)} elapsed
                </span>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={handleExportTrace}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors"
                >
                  <Download size={12} />
                  Export Full Trace
                </button>
                <button
                  onClick={handleNewJob}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
                >
                  <RotateCcw size={12} />
                  Start New Job
                </button>
              </div>
            </div>
          )}

          {/* Error state */}
          {errorMsg && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 space-y-3 animate-trace-in">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-400" />
                <h3 className="text-sm font-semibold text-red-300">
                  Workflow Failed
                </h3>
              </div>
              <p className="text-sm text-zinc-400">{errorMsg}</p>
              <button
                onClick={handleNewJob}
                className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:text-white transition-colors"
              >
                <RotateCcw size={12} />
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
