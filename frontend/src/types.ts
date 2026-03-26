export type JobStatus =
  | "pending"
  | "running"
  | "iterating"
  | "completed"
  | "failed"
  | "cancelled";

export type StepType = "vision" | "plan" | "execute" | "critic";

export interface WSMessage {
  id: string;
  jobId: string;
  timestamp: string;
  type: "step" | "status" | "completed" | "error";

  step?: StepType;
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

export interface StepConfig {
  label: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  dotClass: string;
}

export const STEP_CONFIGS: Record<StepType, StepConfig> = {
  vision: {
    label: "Vision Analyzer",
    bgClass: "bg-blue-500/10",
    borderClass: "border-blue-500/20",
    textClass: "text-blue-400",
    dotClass: "bg-blue-500",
  },
  plan: {
    label: "Planner Agent",
    bgClass: "bg-purple-500/10",
    borderClass: "border-purple-500/20",
    textClass: "text-purple-400",
    dotClass: "bg-purple-500",
  },
  execute: {
    label: "Image Editor",
    bgClass: "bg-green-500/10",
    borderClass: "border-green-500/20",
    textClass: "text-green-400",
    dotClass: "bg-green-500",
  },
  critic: {
    label: "Critic / Reflector",
    bgClass: "bg-amber-500/10",
    borderClass: "border-amber-500/20",
    textClass: "text-amber-400",
    dotClass: "bg-amber-500",
  },
};
