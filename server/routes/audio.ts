import { Router } from "express";
import type { Response } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { requireAuth, verifyProjectOwnership, type AuthedRequest } from "../lib/auth";
import { routeTask } from "../lib/router/router";
import { AllProvidersFailedError, ProviderNotAvailableError } from "../lib/router/types";
import type { VoiceGenInput, VoiceGenOutput, VoiceStyle } from "../lib/adapters/voice/openaiTtsAdapter";
import { uploadAudioBuffer, getSignedAudioUrl, deleteAudioObject, audioPathForScene } from "../lib/storageAdmin";

export const audioRouter = Router();

audioRouter.use(requireAuth);
audioRouter.use(verifyProjectOwnership);

const VOICE_STYLES: VoiceStyle[] = ["calm", "serious", "emotional", "energetic", "documentary", "friendly"];

const PREVIEW_TEXT = "Hello! This is a quick preview of this voice style.";

// ---------------------------------------------------------------------------
// POST /api/audio/preview — a short, ephemeral TTS sample. Not persisted to
// audio_assets or Storage; the audio bytes are streamed straight back so the
// UI can let a user audition a voice style before generating real scene audio.
// ---------------------------------------------------------------------------
audioRouter.post("/preview", async (req: AuthedRequest, res: Response) => {
  const { voiceStyle } = req.body ?? {};
  if (voiceStyle && !VOICE_STYLES.includes(voiceStyle)) {
    return res.status(400).json({ error: `\`voiceStyle\` must be one of: ${VOICE_STYLES.join(", ")}` });
  }
  const style: VoiceStyle = voiceStyle || "calm";

  try {
    const result = await routeTask<VoiceGenInput, VoiceGenOutput>(
      "voice_generation",
      { text: PREVIEW_TEXT, voiceStyle: style },
      { userId: req.userId!, feature: "voice_preview" }
    );
    res.setHeader("Content-Type", result.data.contentType);
    res.setHeader("X-Provider", result.providerName);
    res.send(result.data.buffer);
  } catch (err: any) {
    if (err instanceof ProviderNotAvailableError) {
      res.status(503).json({ error: "No voice-generation provider is registered on this server." });
    } else if (err instanceof AllProvidersFailedError) {
      res.status(502).json({ error: "Voice preview failed on every configured provider." });
    } else {
      res.status(502).json({ error: err.message ?? "Failed to generate voice preview." });
    }
  }
});

function estimateDurationSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / 2.5) * 10) / 10);
}

/** Finds an existing audio_assets row for (project, scene) or (project, full-project), or null. */
async function findExistingAsset(projectId: string, sceneId: string | null) {
  let query = supabaseAdmin.from("audio_assets").select("*").eq("project_id", projectId);
  query = sceneId ? query.eq("scene_id", sceneId) : query.is("scene_id", null);
  const { data } = await query.maybeSingle();
  return data;
}

async function upsertAudioAsset(params: {
  projectId: string;
  sceneId: string | null;
  provider: string;
  voiceStyle: string;
  storagePath: string;
  durationSeconds: number;
  status: "ready" | "failed";
}) {
  const existing = await findExistingAsset(params.projectId, params.sceneId);
  const row = {
    project_id: params.projectId,
    scene_id: params.sceneId,
    provider: params.provider,
    voice_style: params.voiceStyle,
    storage_path: params.storagePath,
    duration_seconds: params.durationSeconds,
    status: params.status,
  };
  if (existing) {
    const { data, error } = await supabaseAdmin.from("audio_assets").update(row).eq("id", existing.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabaseAdmin.from("audio_assets").insert(row).select().single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// POST /api/audio/generate-scene
// ---------------------------------------------------------------------------
audioRouter.post("/generate-scene", async (req: AuthedRequest, res: Response) => {
  const { projectId, sceneId, voiceStyle } = req.body ?? {};

  if (!projectId || !sceneId) {
    return res.status(400).json({ error: "`projectId` and `sceneId` are required." });
  }
  if (voiceStyle && !VOICE_STYLES.includes(voiceStyle)) {
    return res.status(400).json({ error: `\`voiceStyle\` must be one of: ${VOICE_STYLES.join(", ")}` });
  }

  const { data: scene, error: sceneError } = await supabaseAdmin
    .from("scenes")
    .select("id, voiceover_text")
    .eq("id", sceneId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (sceneError || !scene) {
    return res.status(404).json({ error: "Scene not found." });
  }
  if (!scene.voiceover_text || !scene.voiceover_text.trim()) {
    return res.status(400).json({ error: "This scene has no voice-over text to synthesize yet." });
  }

  const style: VoiceStyle = voiceStyle || "calm";

  try {
    const result = await routeTask<VoiceGenInput, VoiceGenOutput>(
      "voice_generation",
      { text: scene.voiceover_text, voiceStyle: style },
      { userId: req.userId!, projectId, feature: "voice_generate" }
    );
    const path = audioPathForScene(req.userId!, projectId, sceneId);
    await uploadAudioBuffer(path, result.data.buffer, result.data.contentType);

    const asset = await upsertAudioAsset({
      projectId,
      sceneId,
      provider: result.providerName,
      voiceStyle: style,
      storagePath: path,
      durationSeconds: estimateDurationSeconds(scene.voiceover_text),
      status: "ready",
    });

    const signedUrl = await getSignedAudioUrl(path);
    res.json({ asset, signedUrl });
  } catch (err: any) {
    console.error("[generate-scene audio]", err);
    try {
      await upsertAudioAsset({
        projectId,
        sceneId,
        provider: "unknown",
        voiceStyle: style,
        storagePath: "",
        durationSeconds: 0,
        status: "failed",
      });
    } catch {
      /* ignore secondary failure */
    }
    if (err instanceof ProviderNotAvailableError) {
      res.status(503).json({ error: "No voice-generation provider is registered on this server." });
    } else if (err instanceof AllProvidersFailedError) {
      res.status(502).json({ error: "Voice generation failed on every configured provider. Please try again shortly." });
    } else {
      res.status(502).json({ error: err.message ?? "Failed to generate voice-over." });
    }
  }
});

// ---------------------------------------------------------------------------
// POST /api/audio/generate-project — generates (or regenerates) audio for
// every scene in the project, sequentially. Returns per-scene results so the
// UI can show which scenes succeeded/failed without losing the whole batch.
// ---------------------------------------------------------------------------
audioRouter.post("/generate-project", async (req: AuthedRequest, res: Response) => {
  const { projectId, voiceStyle } = req.body ?? {};

  if (!projectId) return res.status(400).json({ error: "`projectId` is required." });
  if (voiceStyle && !VOICE_STYLES.includes(voiceStyle)) {
    return res.status(400).json({ error: `\`voiceStyle\` must be one of: ${VOICE_STYLES.join(", ")}` });
  }
  const style: VoiceStyle = voiceStyle || "calm";

  const { data: scenes, error: scenesError } = await supabaseAdmin
    .from("scenes")
    .select("id, scene_number, voiceover_text")
    .eq("project_id", projectId)
    .order("scene_number");

  if (scenesError) return res.status(500).json({ error: "Failed to load scenes." });
  if (!scenes || scenes.length === 0) {
    return res.status(400).json({ error: "This project has no scenes yet — build scenes first." });
  }

  const results: Array<{ sceneId: string; sceneNumber: number; status: "ready" | "failed" | "skipped"; error?: string }> = [];

  for (const scene of scenes) {
    if (!scene.voiceover_text || !scene.voiceover_text.trim()) {
      results.push({ sceneId: scene.id, sceneNumber: scene.scene_number, status: "skipped", error: "No voice-over text" });
      continue;
    }
    try {
      const result = await routeTask<VoiceGenInput, VoiceGenOutput>(
        "voice_generation",
        { text: scene.voiceover_text, voiceStyle: style },
        { userId: req.userId!, projectId, feature: "voice_generate" }
      );
      const path = audioPathForScene(req.userId!, projectId, scene.id);
      await uploadAudioBuffer(path, result.data.buffer, result.data.contentType);
      await upsertAudioAsset({
        projectId,
        sceneId: scene.id,
        provider: result.providerName,
        voiceStyle: style,
        storagePath: path,
        durationSeconds: estimateDurationSeconds(scene.voiceover_text),
        status: "ready",
      });
      results.push({ sceneId: scene.id, sceneNumber: scene.scene_number, status: "ready" });
    } catch (err: any) {
      console.error(`[generate-project audio] scene ${scene.scene_number}`, err);
      results.push({ sceneId: scene.id, sceneNumber: scene.scene_number, status: "failed", error: err.message });
    }
  }

  const allOk = results.every((r) => r.status === "ready");
  if (allOk) {
    await supabaseAdmin.from("projects").update({ status: "audio_ready" }).eq("id", projectId);
  }

  res.json({ results });
});

// ---------------------------------------------------------------------------
// GET /api/audio/signed-url/:assetId?projectId=...
// ---------------------------------------------------------------------------
audioRouter.get("/signed-url/:assetId", async (req: AuthedRequest, res: Response) => {
  const { assetId } = req.params;
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) return res.status(400).json({ error: "`projectId` query parameter is required." });

  const { data: asset, error } = await supabaseAdmin
    .from("audio_assets")
    .select("id, storage_path, status")
    .eq("id", assetId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error || !asset || !asset.storage_path || asset.status !== "ready") {
    return res.status(404).json({ error: "Audio asset not found or not ready." });
  }

  try {
    const signedUrl = await getSignedAudioUrl(asset.storage_path);
    res.json({ signedUrl });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? "Failed to sign audio URL." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/audio/:assetId?projectId=...
// ---------------------------------------------------------------------------
audioRouter.delete("/:assetId", async (req: AuthedRequest, res: Response) => {
  const { assetId } = req.params;
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) return res.status(400).json({ error: "`projectId` query parameter is required." });

  const { data: asset } = await supabaseAdmin
    .from("audio_assets")
    .select("id, storage_path")
    .eq("id", assetId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!asset) return res.status(404).json({ error: "Audio asset not found." });

  try {
    if (asset.storage_path) await deleteAudioObject(asset.storage_path);
  } catch (err) {
    console.error("[delete audio] storage cleanup failed:", err);
  }

  await supabaseAdmin.from("audio_assets").delete().eq("id", assetId);
  res.json({ ok: true });
});
