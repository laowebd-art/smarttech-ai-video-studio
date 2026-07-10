import { Router } from "express";
import type { Response } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { submitAsyncTask, checkAsyncStatus, cancelAsyncTask } from "../lib/router/asyncRouter";
import { AllAsyncProvidersFailedError, AsyncProviderNotAvailableError, type VideoGenInput, type VideoGenMode } from "../lib/router/asyncTypes";
import { asyncProviderRegistry } from "../lib/router/asyncRegistry";
import { aiVideoPathForJob, uploadAiVideoBuffer, getSignedAiVideoUrl } from "../lib/storageAdmin";

export const videoGenRouter = Router();

videoGenRouter.use(requireAuth);

const MODES: VideoGenMode[] = ["text_to_video", "image_to_video"];

async function getOwnedJob(jobId: string, userId: string) {
  const { data } = await supabaseAdmin.from("ai_generation_jobs").select("*").eq("id", jobId).eq("user_id", userId).maybeSingle();
  return data;
}

/** Downloads the provider's result and mirrors it into our own storage so the provider's (often time-limited) URL isn't a long-term dependency. */
async function mirrorResultToStorage(userId: string, jobId: string, resultUrl: string, providerName: string): Promise<string> {
  const adapter = asyncProviderRegistry.getByProviderName(providerName);
  const extraHeaders = adapter?.getResultDownloadHeaders?.() ?? {};
  const response = await fetch(resultUrl, { headers: extraHeaders });
  if (!response.ok) throw new Error(`Failed to download generated video from ${providerName} (${response.status}).`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const path = aiVideoPathForJob(userId, jobId);
  await uploadAiVideoBuffer(path, buffer);
  return path;
}

// ---------------------------------------------------------------------------
// POST /api/video/generate
// ---------------------------------------------------------------------------
videoGenRouter.post("/generate", async (req: AuthedRequest, res: Response) => {
  const { mode, prompt, imageUrl, durationSeconds, aspectRatio, projectId, sceneId } = req.body ?? {};

  if (!mode || !MODES.includes(mode)) {
    return res.status(400).json({ error: `\`mode\` must be one of: ${MODES.join(", ")}` });
  }
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "`prompt` is required." });
  }
  if (mode === "image_to_video" && (!imageUrl || typeof imageUrl !== "string")) {
    return res.status(400).json({ error: "`imageUrl` is required when mode is image_to_video." });
  }

  if (projectId) {
    const { data: owned } = await supabaseAdmin.from("projects").select("id").eq("id", projectId).eq("user_id", req.userId).maybeSingle();
    if (!owned) return res.status(404).json({ error: "Project not found." });
  }

  const input: VideoGenInput = { mode, prompt, imageUrl, durationSeconds, aspectRatio };

  const { data: job, error: insertError } = await supabaseAdmin
    .from("ai_generation_jobs")
    .insert({
      user_id: req.userId,
      project_id: projectId ?? null,
      scene_id: sceneId ?? null,
      capability: "video_generation",
      mode,
      status: "queued",
      input,
    })
    .select()
    .single();

  if (insertError || !job) return res.status(500).json({ error: "Failed to create generation job." });

  try {
    const { externalJobId, providerName } = await submitAsyncTask(
      "video_generation",
      input,
      { userId: req.userId!, projectId, feature: "video_generate" }
    );

    const { data: updated } = await supabaseAdmin
      .from("ai_generation_jobs")
      .update({ status: "processing", provider_name: providerName, external_job_id: externalJobId, started_at: new Date().toISOString() })
      .eq("id", job.id)
      .select()
      .single();

    res.status(202).json({ job: updated ?? job });
  } catch (err: any) {
    let message = err.message ?? "Failed to submit video generation job.";
    if (err instanceof AsyncProviderNotAvailableError) {
      message = "No video generation provider is registered on this server.";
    } else if (err instanceof AllAsyncProvidersFailedError) {
      message = "Every configured video provider rejected this request — none are available right now.";
    }
    await supabaseAdmin.from("ai_generation_jobs").update({ status: "failed", error_message: message.slice(0, 2000) }).eq("id", job.id);
    res.status(502).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/video/jobs/:id — polling endpoint. Live-checks the owning
// provider on every call (no background worker in this starter — see
// README/ARCHITECTURE for the scaling note) and mirrors the result into our
// own storage the first time it sees "completed".
// ---------------------------------------------------------------------------
videoGenRouter.get("/jobs/:id", async (req: AuthedRequest, res: Response) => {
  const job = await getOwnedJob(req.params.id, req.userId!);
  if (!job) return res.status(404).json({ error: "Job not found." });

  if (job.status !== "processing" || !job.provider_name || !job.external_job_id) {
    return res.json({ job });
  }

  try {
    const status = await checkAsyncStatus(job.provider_name, job.external_job_id);

    if (status.status === "processing") {
      const progress = status.progress ?? job.progress;
      if (progress !== job.progress) {
        await supabaseAdmin.from("ai_generation_jobs").update({ progress }).eq("id", job.id);
      }
      return res.json({ job: { ...job, progress } });
    }

    if (status.status === "completed" && status.resultUrl) {
      let storagePath: string | null = null;
      try {
        storagePath = await mirrorResultToStorage(req.userId!, job.id, status.resultUrl, job.provider_name);
      } catch (mirrorErr: any) {
        console.error("[video jobs] failed to mirror result to storage:", mirrorErr);
        // Still mark completed with the provider's own URL as a fallback — better than losing the result.
      }
      const { data: updated } = await supabaseAdmin
        .from("ai_generation_jobs")
        .update({
          status: "completed",
          progress: 100,
          result_url: status.resultUrl,
          storage_path: storagePath,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .select()
        .single();
      return res.json({ job: updated ?? job });
    }

    if (status.status === "failed") {
      const { data: updated } = await supabaseAdmin
        .from("ai_generation_jobs")
        .update({ status: "failed", error_message: status.errorMessage ?? "Generation failed.", completed_at: new Date().toISOString() })
        .eq("id", job.id)
        .select()
        .single();
      return res.json({ job: updated ?? job });
    }

    if (status.status === "cancelled") {
      const { data: updated } = await supabaseAdmin
        .from("ai_generation_jobs")
        .update({ status: "cancelled", completed_at: new Date().toISOString() })
        .eq("id", job.id)
        .select()
        .single();
      return res.json({ job: updated ?? job });
    }

    res.json({ job });
  } catch (err: any) {
    console.error("[video jobs] status check failed:", err);
    res.json({ job }); // return last known state rather than erroring the poll
  }
});

// ---------------------------------------------------------------------------
// GET /api/video/jobs?projectId=...  (optional)
// ---------------------------------------------------------------------------
videoGenRouter.get("/jobs", async (req: AuthedRequest, res: Response) => {
  const projectId = req.query.projectId as string | undefined;
  let query = supabaseAdmin.from("ai_generation_jobs").select("*").eq("user_id", req.userId).order("created_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);
  const { data: jobs, error } = await query.limit(100);
  if (error) return res.status(500).json({ error: "Failed to load jobs." });
  res.json({ jobs: jobs ?? [] });
});

// ---------------------------------------------------------------------------
// POST /api/video/jobs/:id/retry
// ---------------------------------------------------------------------------
videoGenRouter.post("/jobs/:id/retry", async (req: AuthedRequest, res: Response) => {
  const job = await getOwnedJob(req.params.id, req.userId!);
  if (!job) return res.status(404).json({ error: "Job not found." });
  if (job.status !== "failed" && job.status !== "cancelled") {
    return res.status(400).json({ error: "Only failed or cancelled jobs can be retried." });
  }
  if (job.retry_count >= job.max_retries) {
    return res.status(400).json({ error: `This job has already been retried ${job.retry_count} time(s), the maximum allowed.` });
  }

  try {
    const { externalJobId, providerName } = await submitAsyncTask(
      "video_generation",
      job.input,
      { userId: req.userId!, projectId: job.project_id ?? undefined, feature: "video_generate_retry" }
    );
    const { data: updated } = await supabaseAdmin
      .from("ai_generation_jobs")
      .update({
        status: "processing",
        provider_name: providerName,
        external_job_id: externalJobId,
        progress: 0,
        error_message: null,
        retry_count: job.retry_count + 1,
        started_at: new Date().toISOString(),
        completed_at: null,
      })
      .eq("id", job.id)
      .select()
      .single();
    res.json({ job: updated ?? job });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? "Retry failed." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/video/jobs/:id/cancel
// ---------------------------------------------------------------------------
videoGenRouter.post("/jobs/:id/cancel", async (req: AuthedRequest, res: Response) => {
  const job = await getOwnedJob(req.params.id, req.userId!);
  if (!job) return res.status(404).json({ error: "Job not found." });
  if (job.status !== "processing" && job.status !== "queued") {
    return res.status(400).json({ error: "Only queued or in-progress jobs can be cancelled." });
  }

  try {
    if (job.provider_name && job.external_job_id) {
      await cancelAsyncTask(job.provider_name, job.external_job_id);
    }
  } catch (err: any) {
    // Some providers don't support cancellation (see adapter docs) — we still
    // mark it cancelled on our side so the user isn't stuck; note the caveat.
    console.error("[video jobs] provider-side cancel failed or unsupported:", err.message);
  }

  const { data: updated } = await supabaseAdmin
    .from("ai_generation_jobs")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", job.id)
    .select()
    .single();
  res.json({ job: updated ?? job });
});

// ---------------------------------------------------------------------------
// GET /api/video/jobs/:id/download
// ---------------------------------------------------------------------------
videoGenRouter.get("/jobs/:id/download", async (req: AuthedRequest, res: Response) => {
  const job = await getOwnedJob(req.params.id, req.userId!);
  if (!job || job.status !== "completed") return res.status(404).json({ error: "No completed video for this job." });

  if (job.storage_path) {
    try {
      const signedUrl = await getSignedAiVideoUrl(job.storage_path);
      return res.json({ url: signedUrl, expiresIn: 3600 });
    } catch (err: any) {
      console.error("[video download] signed URL failed, falling back to provider URL:", err);
    }
  }
  if (job.result_url) return res.json({ url: job.result_url, expiresIn: null });
  res.status(404).json({ error: "No downloadable video found for this job." });
});
