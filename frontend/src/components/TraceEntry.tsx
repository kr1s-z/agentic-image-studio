import { useState } from "react";
import {
  Eye,
  Route,
  Paintbrush,
  MessageSquareWarning,
  ChevronDown,
  ChevronRight,
  Activity,
} from "lucide-react";
import type { WSMessage, StepType } from "../types";
import { STEP_CONFIGS } from "../types";

const STEP_ICONS: Record<StepType, typeof Eye> = {
  vision: Eye,
  plan: Route,
  execute: Paintbrush,
  critic: MessageSquareWarning,
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface Props {
  entry: WSMessage;
  isLatest: boolean;
}

export default function TraceEntry({ entry, isLatest }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (entry.type !== "step") return null;

  const stepType = entry.step;
  if (!stepType || !STEP_CONFIGS[stepType]) return null;

  const config = STEP_CONFIGS[stepType];
  const Icon = STEP_ICONS[stepType] ?? Activity;

  const isRunning =
    entry.detail?.includes("…") ||
    entry.detail?.includes("...") ||
    entry.message?.includes("…") ||
    entry.message?.includes("...");

  return (
    <div
      className={`group relative pl-8 pb-5 animate-trace-in ${isLatest ? "is-latest" : ""}`}
    >
      {/* Timeline line */}
      <div className="absolute left-[11px] top-7 bottom-0 w-px bg-zinc-800 group-last:hidden" />

      {/* Timeline dot */}
      <div
        className={`absolute left-0 top-1.5 w-[23px] h-[23px] rounded-full border-2 border-zinc-900 flex items-center justify-center ${config.dotClass} ${isRunning && isLatest ? "animate-pulse" : ""}`}
      >
        <Icon size={11} className="text-white" strokeWidth={2.5} />
      </div>

      {/* Content card */}
      <div
        className={`rounded-xl border p-3.5 transition-colors ${config.bgClass} ${config.borderClass} hover:border-opacity-40`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${config.textClass}`}
              >
                {config.label}
              </span>
            </div>
            <p className="text-sm font-medium text-zinc-200 leading-snug">
              {entry.message}
            </p>
          </div>
          <span className="text-[10px] text-zinc-600 whitespace-nowrap pt-0.5">
            {formatTime(entry.timestamp)}
          </span>
        </div>

        {/* Detail */}
        {entry.detail && (
          <p className="mt-2 text-xs text-zinc-400 leading-relaxed whitespace-pre-line">
            {entry.detail}
          </p>
        )}

        {/* Inline image thumbnail for execute steps */}
        {entry.imageUrl && (
          <div className="mt-2.5 rounded-lg overflow-hidden border border-zinc-700/50 max-w-[180px]">
            <img
              src={entry.imageUrl}
              alt="Intermediate result"
              className="w-full h-auto block"
              loading="lazy"
            />
          </div>
        )}

        {/* Score badge for critic */}
        {entry.data &&
          typeof entry.data.score === "number" && (
            <div className="mt-2.5 flex items-center gap-3">
              <div
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                  (entry.data.score as number) >= 8
                    ? "bg-green-500/15 text-green-400 border border-green-500/20"
                    : "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                }`}
              >
                Score: {(entry.data.score as number).toFixed(1)}/10
              </div>
              {typeof entry.data.approved === "boolean" && (
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider ${
                    entry.data.approved
                      ? "text-green-500"
                      : "text-amber-500"
                  }`}
                >
                  {entry.data.approved ? "accepted" : "iterate"}
                </span>
              )}
            </div>
          )}

        {/* Expandable raw JSON */}
        {entry.data && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2.5 flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Raw payload
          </button>
        )}
        {expanded && entry.data && (
          <pre className="mt-2 text-[10px] text-zinc-500 bg-black/30 rounded-lg p-3 overflow-x-auto leading-relaxed">
            {JSON.stringify(entry.data, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
