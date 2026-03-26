import { useMemo, useState } from "react";
import { Wifi, WifiOff, ChevronDown, ChevronRight } from "lucide-react";
import type { WSMessage } from "../types";
import { useAutoScroll } from "../hooks/useAutoScroll";
import TraceEntry from "./TraceEntry";

interface Props {
  trace: WSMessage[];
  connected: boolean;
  onReconnect: () => void;
}

interface IterationGroup {
  iteration: number;
  entries: WSMessage[];
}

export default function AgentTrace({ trace, connected, onReconnect }: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const { containerRef, userScrolled, handleScroll } =
    useAutoScroll<HTMLDivElement>(trace.length);

  const stepEntries = useMemo(
    () => trace.filter((m) => m.type === "step"),
    [trace],
  );

  const groups = useMemo<IterationGroup[]>(() => {
    const map = new Map<number, WSMessage[]>();
    for (const entry of stepEntries) {
      const iter = entry.iteration ?? 1;
      if (!map.has(iter)) map.set(iter, []);
      map.get(iter)!.push(entry);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([iteration, entries]) => ({ iteration, entries }));
  }, [stepEntries]);

  const maxIteration =
    groups.length > 0 ? groups[groups.length - 1].iteration : 0;

  function toggleCollapse(iter: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(iter)) next.delete(iter);
      else next.add(iter);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          Agent Trace
          {stepEntries.length > 0 && (
            <span className="text-[10px] font-normal text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
              {stepEntries.length} steps
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1.5">
          {connected ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <Wifi size={12} className="text-green-500" />
              <span className="text-[10px] text-green-500 font-medium">
                Live
              </span>
            </>
          ) : (
            <button
              onClick={onReconnect}
              className="flex items-center gap-1.5 text-[10px] text-red-400 hover:text-red-300 transition-colors"
            >
              <WifiOff size={12} />
              Disconnected — Reconnect
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 scrollbar-thin"
      >
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-zinc-700 border-t-indigo-500 animate-spin" />
            <p className="text-sm">Waiting for agent activity…</p>
          </div>
        ) : (
          groups.map((group) => {
            const isCollapsed = collapsed.has(group.iteration);
            const showHeader = maxIteration > 1;

            return (
              <div key={group.iteration} className="mb-2">
                {showHeader && (
                  <button
                    onClick={() => toggleCollapse(group.iteration)}
                    className="flex items-center gap-2 mb-3 w-full group/iter"
                  >
                    {isCollapsed ? (
                      <ChevronRight
                        size={14}
                        className="text-zinc-600 group-hover/iter:text-zinc-400"
                      />
                    ) : (
                      <ChevronDown
                        size={14}
                        className="text-zinc-600 group-hover/iter:text-zinc-400"
                      />
                    )}
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 group-hover/iter:text-zinc-300 transition-colors">
                      Iteration {group.iteration}
                    </span>
                    <span className="flex-1 h-px bg-zinc-800" />
                    <span className="text-[10px] text-zinc-600">
                      {group.entries.length} steps
                    </span>
                  </button>
                )}

                {!isCollapsed &&
                  group.entries.map((entry, i) => (
                    <TraceEntry
                      key={entry.id}
                      entry={entry}
                      isLatest={
                        group.iteration === maxIteration &&
                        i === group.entries.length - 1
                      }
                    />
                  ))}
              </div>
            );
          })
        )}
      </div>

      {/* Scroll-to-bottom indicator */}
      {userScrolled && (
        <button
          onClick={() =>
            containerRef.current?.scrollTo({
              top: containerRef.current.scrollHeight,
              behavior: "smooth",
            })
          }
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-medium shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 transition-colors"
        >
          ↓ New activity
        </button>
      )}
    </div>
  );
}
