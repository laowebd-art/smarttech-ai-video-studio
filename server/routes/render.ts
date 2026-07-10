import { Router } from "express";
import type { Response } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { requireAuth, verifyProjectOwnership, type AuthedRequest } from "../lib/auth";
import { renderProject } from "../lib/renderPipeline";
import { getSignedRenderUrl } from "../lib/storageAdmin";

export const renderRouter = Router();

renderRouter.use(requireAuth);

async function getUserProjectIds(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from("projects").select("id").eq("user_id", userId);
  return (data ?? []).map((p: any) => p.id);
}

// ---------------------------------------------------------------------------
// POST /api/render/start — kicks off a render job and returns immediately.
//
// There's no separate job-queue infrastructure (e.g. BullMQ + Redis) in this
// starter — rendering runs as an in-process async task on this same server.
// That's fine for a single self-hosted instance, but won't scale across
// multiple server instances or survive a server restart mid-render; a real
// production deployment should swap this for a proper queue.
// ---------------------------------------------------------------------------
renderRouter.post("/start", verifyProjectOwnership, async (req: AuthedRequest, res: Response) => {
  const { projectId } = req.body ?? {};
  if (!projectId) return res.status(400).json({ error: "`projectId` is required." });

  const { data: scenes } = await supabaseAdmin.from("scenes").select("id").eq("project_id", projectId).limit(1);
  if (!scenes || scenes.length === 0) {
    return res.status(400).json({ error: "This project has no scenes yet — build scenes before rendering." });
  }

  const { data: job, error } = await supabaseAdmin
    .from("render_jobs")
    .insert({ project_id: projectId, status: "queued", progress: 0 })
    .select()
    .single();

  if (error || !job) {
    return res.status(500).json({ error: "Failed to create render job." });
  }

  // Fire-and-forget: the HTTP response returns immediately with the job id;
  // the client polls GET /api/render/job/:jobId for progress.
  void renderProject(job.id, projectId, req.userId!).catch((err) => {
    console.error(`[render/start] job ${job.id} failed:`, err);
  });

  res.status(202).json({ job });
});

// ---------------------------------------------------------------------------
// GET /api/render/job/:jobId?projectId=...
// ---------------------------------------------------------------------------
renderRouter.get("/job/:jobId", verifyProjectOwnership, async (req: AuthedRequest, res: Response) => {
  const { jobId } = req.params;
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) return res.status(400).json({ error: "`projectId` query parameter is required." });

  const { data: job, error } = await supabaseAdmin
    .from("render_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error || !job) return res.status(404).json({ error: "Render job not found." });
  res.json({ job });
});

// ---------------------------------------------------------------------------
// GET /api/render/jobs?projectId=...  (projectId optional — omit for all of
// the current user's jobs across every project, used by the global Render
// Queue page)
// ---------------------------------------------------------------------------
renderRouter.get("/jobs", async (req: AuthedRequest, res: Response) => {
  const projectId = req.query.projectId as string | undefined;

  if (projectId) {
    const { data: owned } = await supabaseAdmin.from("projects").select("id").eq("id", projectId).eq("user_id", req.userId).maybeSingle();
    if (!owned) return res.status(404).json({ error: "Project not found." });

    const { data: jobs } = await supabaseAdmin
      .from("render_jobs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    return res.json({ jobs: jobs ?? [] });
  }

  const projectIds = await getUserProjectIds(req.userId!);
  if (projectIds.length === 0) return res.json({ jobs: [] });

  const { data: jobs } = await supabaseAdmin
    .from("render_jobs")
    .select("*, project:projects(title)")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false })
    .limit(100);

  res.json({ jobs: jobs ?? [] });
});

// ---------------------------------------------------------------------------
// GET /api/render/exports?projectId=...  (projectId optional, same pattern)
// ---------------------------------------------------------------------------
renderRouter.get("/exports", async (req: AuthedRequest, res: Response) => {
  const projectId = req.query.projectId as string | undefined;

  let query = supabaseAdmin.from("exported_videos").select("*, project:projects(title, user_id)").order("created_at", { ascending: false });

  if (projectId) {
    const { data: owned } = await supabaseAdmin.from("projects").select("id").eq("id", projectId).eq("user_id", req.userId).maybeSingle();
    if (!owned) return res.status(404).json({ error: "Project not found." });
    query = query.eq("project_id", projectId);
  } else {
    const projectIds = await getUserProjectIds(req.userId!);
    if (projectIds.length === 0) return res.json({ exports: [] });
    query = query.in("project_id", projectIds);
  }

  const { data: exports, error } = await query.limit(100);
  if (error) return res.status(500).json({ error: "Failed to load exported videos." });

  res.json({ exports: exports ?? [] });
});

// ---------------------------------------------------------------------------
// GET /api/render/download/:exportId?projectId=... — short-lived signed URL
// ---------------------------------------------------------------------------
renderRouter.get("/download/:exportId", verifyProjectOwnership, async (req: AuthedRequest, res: Response) => {
  const { exportId } = req.params;
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) return res.status(400).json({ error: "`projectId` query parameter is required." });

  const { data: exportedVideo } = await supabaseAdmin
    .from("exported_videos")
    .select("id, storage_path")
    .eq("id", exportId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!exportedVideo?.storage_path) return res.status(404).json({ error: "Export not found." });

  try {
    const signedUrl = await getSignedRenderUrl(exportedVideo.storage_path);
    res.json({ signedUrl });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? "Failed to sign download URL." });
  }
});
