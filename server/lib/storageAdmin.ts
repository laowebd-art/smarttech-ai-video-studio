import { supabaseAdmin } from "./supabaseAdmin";

const AUDIO_BUCKET = "project-audio";
const VISUALS_BUCKET = "project-visuals";
const RENDERS_BUCKET = "project-renders";

/** Uploads (or overwrites, via upsert) an audio buffer at a deterministic path. */
export async function uploadAudioBuffer(path: string, buffer: Buffer, contentType = "audio/mpeg"): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(AUDIO_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Failed to upload audio to storage: ${error.message}`);
}

/** project-audio is a private bucket — playback requires a short-lived signed URL. */
export async function getSignedAudioUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(AUDIO_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(`Failed to sign audio URL: ${error?.message ?? "unknown error"}`);
  return data.signedUrl;
}

export async function deleteAudioObject(path: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(AUDIO_BUCKET).remove([path]);
  if (error) throw new Error(`Failed to delete audio from storage: ${error.message}`);
}

/** Deterministic path so regenerating a scene's audio just overwrites the same object. */
export function audioPathForScene(userId: string, projectId: string, sceneId: string): string {
  return `${userId}/${projectId}/scenes/${sceneId}.mp3`;
}

export function audioPathForProject(userId: string, projectId: string): string {
  return `${userId}/${projectId}/full-project.mp3`;
}

// ---------------------------------------------------------------------------
// Generic helpers used by the render pipeline (server/lib/renderPipeline.ts)
// to pull down source assets (audio + visuals) and push up the finished MP4.
// ---------------------------------------------------------------------------

export async function downloadStorageObject(bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Failed to download ${bucket}/${path}: ${error?.message ?? "unknown error"}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function downloadAudioObject(path: string): Promise<Buffer> {
  return downloadStorageObject(AUDIO_BUCKET, path);
}

export async function downloadVisualObject(path: string): Promise<Buffer> {
  return downloadStorageObject(VISUALS_BUCKET, path);
}

export function renderPathForProject(userId: string, projectId: string, renderJobId: string): string {
  return `${userId}/${projectId}/renders/${renderJobId}.mp4`;
}

export async function uploadRenderBuffer(path: string, buffer: Buffer): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(RENDERS_BUCKET).upload(path, buffer, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw new Error(`Failed to upload render to storage: ${error.message}`);
}

export async function getSignedRenderUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(RENDERS_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(`Failed to sign render URL: ${error?.message ?? "unknown error"}`);
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// AI-generated video clips (Kling/Veo/Runway output), distinct from the
// FFmpeg-composited renders above.
// ---------------------------------------------------------------------------
const AI_VIDEOS_BUCKET = "ai-generated-videos";

export function aiVideoPathForJob(userId: string, jobId: string): string {
  return `${userId}/${jobId}.mp4`;
}

export async function uploadAiVideoBuffer(path: string, buffer: Buffer): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(AI_VIDEOS_BUCKET).upload(path, buffer, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw new Error(`Failed to upload generated video to storage: ${error.message}`);
}

export async function getSignedAiVideoUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(AI_VIDEOS_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(`Failed to sign generated-video URL: ${error?.message ?? "unknown error"}`);
  return data.signedUrl;
}
