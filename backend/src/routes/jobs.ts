import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import sharp from "sharp";
import { getJob, setJob } from "../store";
import { runWorkflow } from "../services/workflow";
import type { Job, ImageEntry } from "../types";
import { startJobTrace, cancelJobTrace } from "../services/observability";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post("/jobs", upload.array("images", 10), async (req, res) => {
  const { goal, model } = req.body;
  const files = req.files as Express.Multer.File[] | undefined;

  if (!files?.length || !goal) {
    return res
      .status(400)
      .json({ error: "At least one image and a goal are required" });
  }

  const jobId = crypto.randomUUID();
  const { saveImage } = await import("../services/imaging");

  const images: ImageEntry[] = await Promise.all(
    files.map(async (f, i) => {
      const url = await saveImage(jobId, f.buffer, `original_${i}`);
      return {
        buffer: f.buffer,
        mime: f.mimetype,
        filename: f.originalname,
        url,
      };
    }),
  );

  const primary = images[0];
  const imageUrls = images.map((img) => img.url);

  const job: Job = {
    id: jobId,
    goal,
    model: model || "stability-ai/sdxl",
    status: "pending",
    images,
    originalImage: primary.buffer,
    originalMime: primary.mime,
    currentImage: primary.buffer,
    currentMime: primary.mime,
    history: [],
    createdAt: new Date().toISOString(),
    iteration: 0,
    maxIterations: Number(process.env.MAX_ITERATIONS) || 5,
    cancelled: false,
    originalFilename: primary.filename,
  };

  setJob(job);
  startJobTrace({
    jobId,
    goal,
    model: job.model,
    imageCount: images.length,
    maxIterations: job.maxIterations,
  });
  console.log(
    `[api] Job created: ${jobId} — model: ${job.model} — ${images.length} image(s) — goal: "${goal.slice(0, 80)}"`,
  );

  res.json({ jobId, imageUrls });
});

router.get("/jobs/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  res.json({
    id: job.id,
    goal: job.goal,
    model: job.model,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    iteration: job.iteration,
    maxIterations: job.maxIterations,
    finalScore: job.finalScore,
    historyLength: job.history.length,
    imageCount: job.images.length,
  });
});

router.get("/jobs/:jobId/history", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job.history);
});

router.post("/jobs/:jobId/cancel", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  job.cancelled = true;
  job.status = "cancelled";
  cancelJobTrace(job.id);

  const { broadcastStatus } = require("../services/broadcast");
  broadcastStatus(job.id, "cancelled", "Job cancelled by user");

  res.json({ status: "cancelled" });
});

router.get("/jobs/:jobId/download", async (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  if (job.status !== "completed") {
    return res.status(400).json({ error: "Job is not yet completed" });
  }

  const jpgBuf = await sharp(job.currentImage)
    .jpeg({ quality: 95 })
    .toBuffer();
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="agentic-studio-${job.id.slice(0, 8)}.jpg"`,
  );
  res.send(jpgBuf);
});

export { router as jobRoutes, runWorkflow };
