import { useState, useRef, type DragEvent, type FormEvent } from "react";
import {
  Upload,
  Sparkles,
  X,
  Image as ImageIcon,
  Plus,
  ChevronDown,
  Cpu,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

const MODELS = [
  { id: "black-forest-labs/flux-1.1-pro", name: "Flux 1.1 Pro" },
  { id: "black-forest-labs/flux-schnell", name: "Flux Schnell" },
  { id: "stability-ai/sdxl", name: "Stable Diffusion XL" },
  { id: "bytedance/sdxl-lightning-4step", name: "SDXL Lightning" },
  { id: "fofr/face-to-sticker", name: "Face to Sticker" },
];

const EXAMPLES = [
  "Turn this photo into a professional LinkedIn headshot with studio lighting",
  "Convert this sketch into a cyberpunk digital art poster with neon accents",
  "Enhance this product photo for e-commerce with a clean white background",
  "Restore and colorize this old black-and-white family photograph",
];

interface FileEntry {
  file: File;
  preview: string;
}

interface Props {
  onJobCreated: (
    jobId: string,
    imageUrls: string[],
    goal: string,
    model: string,
  ) => void;
}

export default function LandingScreen({ onJobCreated }: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [goal, setGoal] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [customModel, setCustomModel] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const effectiveModel = showCustom ? customModel.trim() : model;

  function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const valid = files.filter((f) => f.type.startsWith("image/"));
    if (valid.length === 0) {
      setError("Please upload image files (JPEG, PNG, WebP, or GIF).");
      return;
    }
    setError(null);

    for (const file of valid) {
      const reader = new FileReader();
      reader.onload = () => {
        setEntries((prev) => [
          ...prev,
          { file, preview: reader.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    }
  }

  function removeFile(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!entries.length || !goal.trim() || !effectiveModel) return;

    setSubmitting(true);
    setError(null);

    try {
      const form = new FormData();
      for (const entry of entries) form.append("images", entry.file);
      form.append("goal", goal.trim());
      form.append("model", effectiveModel);

      const res = await fetch(`${API_BASE}/jobs`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Server responded with ${res.status}`);
      }
      const { jobId, imageUrls } = await res.json();
      onJobCreated(jobId, imageUrls, goal.trim(), effectiveModel);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setSubmitting(false);
    }
  }

  const ready =
    entries.length > 0 &&
    goal.trim().length > 0 &&
    effectiveModel.length > 0 &&
    !submitting;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl space-y-8">
        {/* Hero */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-4">
            <Sparkles size={14} />
            Multi-Agent AI Workflow
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent">
            Agentic Image Studio
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg max-w-lg mx-auto leading-relaxed">
            Upload images. Describe your goal. Watch intelligent agents plan,
            edit, critique, and iterate until the result is perfect.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Upload zone + preview grid */}
          {entries.length === 0 ? (
            <div
              role="button"
              tabIndex={0}
              className={`relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 transition-all cursor-pointer
                ${dragging ? "border-indigo-500 bg-indigo-500/5 scale-[1.01]" : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/50"}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  inputRef.current?.click();
              }}
            >
              <div className="w-14 h-14 rounded-xl bg-zinc-800 flex items-center justify-center">
                <Upload className="text-zinc-400" size={24} />
              </div>
              <div className="text-center">
                <p className="text-zinc-300 font-medium">
                  Drop your images here or{" "}
                  <span className="text-indigo-400">browse</span>
                </p>
                <p className="text-zinc-500 text-sm mt-1">
                  Multiple images supported — JPEG, PNG, WebP, GIF — up to 50 MB
                  each
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-300">
                  {entries.length} image{entries.length > 1 ? "s" : ""} selected
                  {entries.length > 1 && (
                    <span className="text-zinc-500 font-normal ml-1.5">
                      — first image is the primary target
                    </span>
                  )}
                </p>
              </div>
              <div
                className={`grid gap-3 ${entries.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}
              >
                {entries.map((entry, i) => (
                  <div
                    key={i}
                    className={`relative group rounded-xl overflow-hidden border bg-zinc-900/50 ${i === 0 ? "border-indigo-500/40 ring-1 ring-indigo-500/20" : "border-zinc-700"}`}
                  >
                    <img
                      src={entry.preview}
                      alt={`Upload ${i + 1}`}
                      className={`w-full object-contain bg-zinc-950 ${entries.length === 1 ? "max-h-72" : "h-36"}`}
                    />
                    {i === 0 && entries.length > 1 && (
                      <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-600 text-white">
                        Primary
                      </span>
                    )}
                    <div className="absolute bottom-0 inset-x-0 flex items-center justify-between px-2.5 py-2 bg-gradient-to-t from-black/80 to-transparent">
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-300 min-w-0">
                        <ImageIcon size={11} className="text-zinc-400 shrink-0" />
                        <span className="truncate">{entry.file.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="p-1 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors shrink-0"
                        aria-label="Remove image"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add more button */}
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-700 hover:border-zinc-500 bg-zinc-900/30 hover:bg-zinc-900/50 text-zinc-500 hover:text-zinc-300 transition-all h-36 cursor-pointer"
                >
                  <Plus size={20} />
                  <span className="text-xs">Add more</span>
                </button>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* Model selector */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Cpu size={14} className="text-zinc-500" />
              Image model
            </label>
            {!showCustom ? (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900/50 px-4 py-2.5 pr-10 text-sm text-zinc-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-all cursor-pointer"
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustom(true)}
                  className="text-xs px-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors whitespace-nowrap"
                >
                  Custom…
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="owner/model-name (e.g. fofr/face-to-sticker)"
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowCustom(false);
                    setCustomModel("");
                  }}
                  className="text-xs px-3 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors whitespace-nowrap"
                >
                  Presets
                </button>
              </div>
            )}
            <p className="text-[11px] text-zinc-600">
              Replicate model used by the Image Editor agent for AI
              transformations. Sharp is always used for basic edits.
            </p>
          </div>

          {/* Goal input */}
          <div className="space-y-2">
            <label
              htmlFor="goal"
              className="block text-sm font-medium text-zinc-300"
            >
              Describe your goal
            </label>
            <textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder='e.g. "Turn this photo into a professional LinkedIn headshot with studio lighting"'
              rows={3}
              className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900/50 px-4 py-3 text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-all text-[15px]"
            />
          </div>

          {/* Example chips */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Try an example
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setGoal(ex)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    goal === ex
                      ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                      : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600"
                  }`}
                >
                  {ex.length > 55 ? ex.slice(0, 55) + "…" : ex}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!ready}
            className="w-full py-3.5 rounded-xl font-semibold text-white transition-all
              bg-gradient-to-r from-indigo-600 to-purple-600
              hover:from-indigo-500 hover:to-purple-500
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-indigo-600 disabled:hover:to-purple-600
              shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating job…
              </span>
            ) : (
              "Start Agentic Workflow"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
