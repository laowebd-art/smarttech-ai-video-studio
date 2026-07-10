import { supabase } from "@/lib/supabase";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import type { AudioAsset } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

export type VoiceStyle = "calm" | "serious" | "emotional" | "energetic" | "documentary" | "friendly";

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

// NOTE: there is intentionally no provider selector here. Which TTS provider
// serves a given request is decided by the AI Router (server/lib/router) —
// see provider_configs — with automatic fallback if the primary provider
// fails. The `provider` field returned on each AudioAsset reflects which one
// actually ran, after the fact; the UI never asks the user to pick one.
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

  async generateForScene(projectId: string, sceneId: string, voiceStyle: VoiceStyle): Promise<GenerateSceneResult> {
    return apiPost<GenerateSceneResult>("/api/audio/generate-scene", { projectId, sceneId, voiceStyle });
  },

  async generateForProject(projectId: string, voiceStyle: VoiceStyle): Promise<{ results: GenerateProjectResultItem[] }> {
    return apiPost("/api/audio/generate-project", { projectId, voiceStyle });
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

  /** Fetches a short spoken sample so the user can audition a voice style before generating real audio. Returns a blob URL — caller should revoke it when done. */
  async preview(voiceStyle: VoiceStyle): Promise<{ url: string; provider: string | null }> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("You must be signed in to preview a voice.");

    const response = await fetch(`${API_BASE_URL}/api/audio/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ voiceStyle }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Preview failed (${response.status})`);
    }

    const provider = response.headers.get("X-Provider");
    const blob = await response.blob();
    return { url: URL.createObjectURL(blob), provider };
  },
};
