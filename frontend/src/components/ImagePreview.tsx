import { useState } from "react";
import { Download, GripVertical, Maximize2, X } from "lucide-react";

interface Props {
  originalUrl: string;
  currentUrl: string | null;
  isCompleted: boolean;
}

export default function ImagePreview({
  originalUrl,
  currentUrl,
  isCompleted,
}: Props) {
  const [sliderValue, setSliderValue] = useState(50);
  const [compareMode, setCompareMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const displayUrl = currentUrl || originalUrl;
  const hasComparison = currentUrl && currentUrl !== originalUrl;

  function handleDownload() {
    const a = document.createElement("a");
    a.href = displayUrl;
    a.download = `agentic-studio-result${displayUrl.substring(displayUrl.lastIndexOf("."))}`;
    a.click();
  }

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-8">
        <button
          onClick={() => setFullscreen(false)}
          className="absolute top-4 right-4 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
        <img
          src={displayUrl}
          alt="Full resolution preview"
          className="max-w-full max-h-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Image display */}
      <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950">
        {isCompleted && compareMode && hasComparison ? (
          /* Before/After slider comparison */
          <div className="relative select-none">
            {/* After (bottom layer) */}
            <img
              src={currentUrl!}
              alt="Processed result"
              className="w-full block"
            />
            {/* Before (clipped top layer) */}
            <div
              className="absolute inset-0"
              style={{ clipPath: `inset(0 ${100 - sliderValue}% 0 0)` }}
            >
              <img
                src={originalUrl}
                alt="Original"
                className="w-full h-full object-cover"
              />
            </div>
            {/* Slider handle */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
              style={{ left: `${sliderValue}%` }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
                <GripVertical size={14} className="text-zinc-700" />
              </div>
            </div>
            {/* Labels */}
            <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/60 text-[10px] font-semibold text-white uppercase tracking-wider">
              Before
            </div>
            <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/60 text-[10px] font-semibold text-white uppercase tracking-wider">
              After
            </div>
            {/* Invisible range input */}
            <input
              type="range"
              min={0}
              max={100}
              value={sliderValue}
              onChange={(e) => setSliderValue(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
              aria-label="Before/after comparison slider"
            />
          </div>
        ) : (
          /* Standard image view */
          <div className="relative">
            <img
              src={displayUrl}
              alt={isCompleted ? "Final result" : "Current preview"}
              className="w-full block"
            />
            {!isCompleted && currentUrl && (
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-green-500/20 border border-green-500/30 text-[10px] font-semibold text-green-400 animate-trace-in">
                Updated
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isCompleted && hasComparison && (
            <button
              onClick={() => setCompareMode(!compareMode)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                compareMode
                  ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                  : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {compareMode ? "Single View" : "Compare Before/After"}
            </button>
          )}
          <button
            onClick={() => setFullscreen(true)}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1.5"
          >
            <Maximize2 size={12} />
            Fullscreen
          </button>
        </div>

        {isCompleted && (
          <button
            onClick={handleDownload}
            className="text-xs px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors flex items-center gap-1.5"
          >
            <Download size={12} />
            Download
          </button>
        )}
      </div>
    </div>
  );
}
