export type JobStatus =
  | "pending"
  | "running"
  | "iterating"
  | "completed"
  | "failed"
  | "cancelled";

export type StepKind = "vision" | "plan" | "execute" | "critic";

/* ---- Structured LLM response types ---- */

export interface VisionAnalysis {
  description: string;
  objects: string[];
  quality: { score: number; issues: string[] };
  style: string;
  relevanceToGoal: string;
  suggestions: string[];
}

export interface PlanStep {
  order: number;
  action: string;
  description: string;
  tool: "sharp" | "replicate";
  parameters: Record<string, unknown>;
}

export interface Plan {
  reasoning: string;
  steps: PlanStep[];
}

export interface Critique {
  score: number;
  feedback: string;
  strengths: string[];
  weaknesses: string[];
  approved: boolean;
  improvements?: string[];
}

/* ---- WebSocket message types ---- */

export interface WSMessage {
  id: string;
  jobId: string;
  timestamp: string;
  type: "step" | "status" | "completed" | "error";

  step?: StepKind;
  iteration?: number;
  message?: string;
  detail?: string;
  data?: Record<string, unknown>;
  imageUrl?: string;

  status?: string;
  progress?: number;

  finalImageUrl?: string;
  summary?: string;
  iterations?: number;
  totalSteps?: number;
  finalScore?: number;
}

/* ---- Image & Job state ---- */

export interface ImageEntry {
  buffer: Buffer;
  mime: string;
  filename: string;
  url: string;
}

export interface Job {
  id: string;
  goal: string;
  model: string;
  status: JobStatus;
  images: ImageEntry[];
  originalImage: Buffer;
  originalMime: string;
  currentImage: Buffer;
  currentMime: string;
  history: WSMessage[];
  createdAt: string;
  completedAt?: string;
  iteration: number;
  maxIterations: number;
  finalScore?: number;
  cancelled: boolean;
  originalFilename: string;
}
