import { supabase } from "@/lib/supabase";
import { apiPost, apiGet, apiDelete } from "@/lib/apiClient";
import type { AudioAsset } from "@/types";

export type VoiceStyle = "calm" | "serious" | "emotional" | "energetic" | "documentary" | "friendly";
export type TtsProvider = "openai" | "elevenlabs";

export interface GenerateSceneResult {
  asset: AudioAsset;
  signedUrl: string;
}

export interface GenerateProjectResultItem {
  sceneId: string;
  sceneNumber: number;
  status: "ready" | "failed" | "skipped";
  error?: string;
}

export const audioService = {
  /** Reads audio_assets rows directly via Supabase (RLS-scoped to the current user). */
  async list(projectId: string): Promise<AudioAsset[]> {
    const { data, error } = await supabase
      .from("audio_assets")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at");
    if (error) throw error;
    return (data as AudioAsset[]) ?? [];
  },

  async generateForScene(
    projectId: string,
    sceneId: string,
    voiceStyle: VoiceStyle,
    provider?: TtsProvider
  ): Promise<GenerateSceneResult> {
    return apiPost<GenerateSceneResult>("/api/audio/generate-scene", { projectId, sceneId, voiceStyle, provider });
  },

  async generateForProject(
    projectId: string,
    voiceStyle: VoiceStyle,
    provider?: TtsProvider
  ): Promise<{ results: GenerateProjectResultItem[] }> {
    return apiPost("/api/audio/generate-project", { projectId, voiceStyle, provider });
  },

  /** project-audio is a private bucket, so playback URLs are short-lived and fetched on demand. */
  async getSignedUrl(assetId: string, projectId: string): Promise<string> {
    const result = await apiGet<{ signedUrl: string }>(
      `/api/audio/signed-url/${assetId}?projectId=${encodeURIComponent(projectId)}`
    );
    return result.signedUrl;
  },

  async remove(assetId: string, projectId: string): Promise<void> {
    await apiDelete(`/api/audio/${assetId}?projectId=${encodeURIComponent(projectId)}`);
  },
};
