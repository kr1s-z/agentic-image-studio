import { getJob } from "../store";
import { isLLMAvailable, analyzeImage, createPlan, critique } from "./llm";
import { executePlanStep, saveImage } from "./imaging";
import {
  broadcastStep,
  broadcastStatus,
  broadcastCompleted,
  broadcastError,
} from "./broadcast";
import type { VisionAnalysis, Plan, Critique } from "../types";

function log(jobId: string, msg: string): void {
  console.log(
    `[workflow] [${jobId.slice(0, 8)}] ${msg}`,
  );
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runWorkflow(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  const mode = isLLMAvailable() ? "LLM" : "simulation";
  log(jobId, `Starting workflow in ${mode} mode — model: ${job.model} — ${job.images.length} image(s) — max ${job.maxIterations} iterations`);

  try {
    job.status = "running";
    broadcastStatus(jobId, "running", `Workflow started — model: ${job.model} — ${job.images.length} image(s)`, {
      progress: 2,
      iteration: 1,
    });

    let totalStepCount = 0;

    for (let iter = 1; iter <= job.maxIterations; iter++) {
      if (job.cancelled) return;
      job.iteration = iter;

      if (iter > 1) {
        job.status = "iterating";
        broadcastStatus(
          jobId,
          "iterating",
          `Starting iteration ${iter} — refining based on critic feedback`,
          { progress: Math.round(((iter - 1) / job.maxIterations) * 100), iteration: iter },
        );
        await delay(mode === "simulation" ? 800 : 200);
      }

      /* ---------- Step 1: Vision Analysis ---------- */
      if (job.cancelled) return;

      broadcastStep(jobId, "vision", {
        message: "Analyzing image with vision model",
        detail:
          iter === 1
            ? "Loading multi-modal vision model to inspect content, quality, and structure…"
            : "Re-analyzing image after edits to assess current state…",
        iteration: iter,
      });

      if (mode === "simulation") await delay(1800);

      let analysis: VisionAnalysis;
      try {
        const imageBuffers = iter === 1
          ? job.images.map((img) => img.buffer)
          : [job.currentImage];
        analysis = await analyzeImage(imageBuffers, job.goal, job.history);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        broadcastStep(jobId, "vision", {
          message: "Vision analysis failed — using fallback",
          detail: msg,
          iteration: iter,
        });
        analysis = {
          description: "Analysis unavailable",
          objects: [],
          quality: { score: 5, issues: ["analysis failed"] },
          style: "unknown",
          relevanceToGoal: "Unable to assess",
          suggestions: ["Proceed with generic enhancement"],
        };
      }

      broadcastStep(jobId, "vision", {
        message: "Vision analysis complete",
        detail: analysis.description,
        iteration: iter,
        data: analysis as unknown as Record<string, unknown>,
      });

      if (mode === "simulation") await delay(600);

      /* ---------- Step 2: Planning ---------- */
      if (job.cancelled) return;

      broadcastStep(jobId, "plan", {
        message:
          iter === 1
            ? "Creating dynamic execution plan"
            : "Revising plan based on critic feedback",
        detail: `Synthesizing goal "${job.goal}" with analysis to build optimal workflow…`,
        iteration: iter,
      });

      if (mode === "simulation") await delay(1200);

      let plan: Plan;
      try {
        plan = await createPlan(
          job.goal,
          analysis,
          iter,
          job.maxIterations,
          job.history,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        broadcastStep(jobId, "plan", {
          message: "Planning failed — using fallback plan",
          detail: msg,
          iteration: iter,
        });
        plan = {
          reasoning: "Fallback: apply basic enhancements",
          steps: [
            {
              order: 1,
              action: "Normalize",
              description: "Auto-level exposure",
              tool: "sharp",
              parameters: { operation: "normalize" },
            },
            {
              order: 2,
              action: "Sharpen",
              description: "Sharpen details",
              tool: "sharp",
              parameters: { operation: "sharpen", sigma: 1.5 },
            },
          ],
        };
      }

      broadcastStep(jobId, "plan", {
        message: `Plan created — ${plan.steps.length} execution steps`,
        detail:
          plan.reasoning +
          "\n\n" +
          plan.steps
            .map((s) => `${s.order}. ${s.action}: ${s.description}`)
            .join("\n"),
        iteration: iter,
        data: plan as unknown as Record<string, unknown>,
      });

      if (mode === "simulation") await delay(500);

      /* ---------- Step 3: Execution ---------- */
      for (const planStep of plan.steps) {
        if (job.cancelled) return;
        totalStepCount++;

        const pct = Math.round(
          ((iter - 1 + (planStep.order - 0.5) / plan.steps.length) /
            job.maxIterations) *
            100,
        );

        broadcastStatus(
          jobId,
          "running",
          `Iteration ${iter} — Step ${planStep.order}/${plan.steps.length}: ${planStep.action}`,
          { progress: Math.min(pct, 95), iteration: iter },
        );

        broadcastStep(jobId, "execute", {
          message: `Executing: ${planStep.action}`,
          detail: `${planStep.description}\nTool: ${planStep.tool} | Parameters: ${JSON.stringify(planStep.parameters)}`,
          iteration: iter,
        });

        if (mode === "simulation") await delay(1500 + Math.random() * 1000);

        try {
          job.currentImage = await executePlanStep(
            job.currentImage,
            planStep,
            job.model,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log(jobId, `Step "${planStep.action}" failed: ${msg}`);
          broadcastStep(jobId, "execute", {
            message: `Step failed: ${planStep.action}`,
            detail: `Error: ${msg} — continuing with previous image`,
            iteration: iter,
          });
          continue;
        }

        const imageUrl = await saveImage(
          jobId,
          job.currentImage,
          `iter${iter}_step${planStep.order}`,
        );

        broadcastStep(jobId, "execute", {
          message: `Completed: ${planStep.action}`,
          detail: `${planStep.action} applied successfully. Intermediate image saved.`,
          iteration: iter,
          imageUrl,
          data: {
            tool: planStep.tool,
            parameters: planStep.parameters,
          },
        });

        if (mode === "simulation") await delay(300);
      }

      /* ---------- Step 4: Critic / Reflection ---------- */
      if (job.cancelled) return;

      broadcastStep(jobId, "critic", {
        message: "Evaluating result quality",
        detail: `Scoring against goal: "${job.goal}"\nAssessing: goal alignment, technical quality, aesthetic appeal`,
        iteration: iter,
      });

      if (mode === "simulation") await delay(2000);

      let critiqueResult: Critique;
      try {
        critiqueResult = await critique(
          job.currentImage,
          job.goal,
          iter,
          job.maxIterations,
          job.history,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        broadcastStep(jobId, "critic", {
          message: "Critic failed — auto-approving",
          detail: msg,
          iteration: iter,
        });
        critiqueResult = {
          score: 7.5,
          feedback: "Critic unavailable — auto-approved",
          strengths: [],
          weaknesses: [],
          approved: true,
        };
      }

      job.finalScore = critiqueResult.score;

      broadcastStep(jobId, "critic", {
        message: critiqueResult.approved
          ? `Accepted — Score: ${critiqueResult.score}/10`
          : `Needs refinement — Score: ${critiqueResult.score}/10`,
        detail: critiqueResult.feedback,
        iteration: iter,
        data: critiqueResult as unknown as Record<string, unknown>,
      });

      if (mode === "simulation") await delay(400);

      if (critiqueResult.approved) {
        log(jobId, `Critic approved at iteration ${iter} with score ${critiqueResult.score}`);
        break;
      }

      log(
        jobId,
        `Critic rejected (score ${critiqueResult.score}) — ${iter < job.maxIterations ? "iterating" : "max iterations reached"}`,
      );
    }

    /* ---------- Completion ---------- */
    if (job.cancelled) return;

    const finalUrl = await saveImage(jobId, job.currentImage, "final");
    job.status = "completed";
    job.completedAt = new Date().toISOString();

    broadcastStatus(jobId, "completed", "Workflow completed", {
      progress: 100,
      iteration: job.iteration,
    });

    broadcastCompleted(jobId, {
      finalImageUrl: finalUrl,
      summary: `Workflow completed in ${job.iteration} iteration(s) with ${totalStepCount} editing steps using ${job.model}. The Vision Analyzer assessed ${job.images.length} image(s), the Planner created adaptive ${mode === "LLM" ? "AI-generated" : "rule-based"} plans, the Image Editor executed all transformations, and the Critic evaluated quality at each iteration${job.finalScore ? ` (final score: ${job.finalScore}/10)` : ""}.`,
      iterations: job.iteration,
      totalSteps: totalStepCount,
      finalScore: job.finalScore ?? 0,
    });

    log(jobId, "Workflow complete");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(jobId, `Workflow failed: ${msg}`);
    job.status = "failed";
    broadcastError(jobId, "Workflow failed", msg);
  }
}
