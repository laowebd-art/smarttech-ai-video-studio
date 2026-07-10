import { Router } from "express";
import type { Response } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { requireAuth, verifyProjectOwnership, type AuthedRequest } from "../lib/auth";
import { synthesizeSpeech, estimateDurationSeconds, type VoiceStyle } from "../lib/ttsProviders";
import { uploadAudioBuffer, getSignedAudioUrl, deleteAudioObject, audioPathForScene } from "../lib/storageAdmin";

export const audioRouter = Router();

audioRouter.use(requireAuth);
audioRouter.use(verifyProjectOwnership);

const VOICE_STYLES: VoiceStyle[] = ["calm", "serious", "emotional", "energetic", "documentary", "friendly"];

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
  const { projectId, sceneId, voiceStyle, provider } = req.body ?? {};

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
    const tts = await synthesizeSpeech(scene.voiceover_text, style, provider);
    const path = audioPathForScene(req.userId!, projectId, sceneId);
    await uploadAudioBuffer(path, tts.buffer, tts.contentType);

    const asset = await upsertAudioAsset({
      projectId,
      sceneId,
      provider: tts.provider,
      voiceStyle: style,
      storagePath: path,
      durationSeconds: estimateDurationSeconds(scene.voiceover_text),
      status: "ready",
    });

    const signedUrl = await getSignedAudioUrl(path);
    res.json({ asset, signedUrl });
  } catch (err: any) {
    console.error("[generate-scene audio]", err);
    // Best-effort: record the failure so the UI can show a failed badge.
    try {
      await upsertAudioAsset({
        projectId,
        sceneId,
        provider: provider || process.env.TTS_PROVIDER || "openai",
        voiceStyle: style,
        storagePath: "",
        durationSeconds: 0,
        status: "failed",
      });
    } catch {
      /* ignore secondary failure */
    }
    res.status(502).json({ error: err.message ?? "Failed to generate voice-over." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/audio/generate-project — generates (or regenerates) audio for
// every scene in the project, sequentially. Returns per-scene results so the
// UI can show which scenes succeeded/failed without losing the whole batch.
// ---------------------------------------------------------------------------
audioRouter.post("/generate-project", async (req: AuthedRequest, res: Response) => {
  const { projectId, voiceStyle, provider } = req.body ?? {};

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
      const tts = await synthesizeSpeech(scene.voiceover_text, style, provider);
      const path = audioPathForScene(req.userId!, projectId, scene.id);
      await uploadAudioBuffer(path, tts.buffer, tts.contentType);
      await upsertAudioAsset({
        projectId,
        sceneId: scene.id,
        provider: tts.provider,
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
    // continue — still delete the DB row so the UI doesn't get stuck
  }

  await supabaseAdmin.from("audio_assets").delete().eq("id", assetId);
  res.json({ ok: true });
});
