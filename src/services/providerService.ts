import { apiGet } from "@/lib/apiClient";

export type Capability =
  | "text_generation"
  | "translation"
  | "image_generation"
  | "video_generation"
  | "voice_generation"
  | "music_generation"
  | "video_editing"
  | "publishing";

export interface ProviderStatus {
  id: string;
  providerName: string;
  capabilities: Capability[];
  configured: boolean;
}

export const providerService = {
  /** Live status straight from the AI Router's registry — never exposes key values, only configured or not. */
  async listStatus(): Promise<ProviderStatus[]> {
    const result = await apiGet<{ providers: ProviderStatus[] }>("/api/providers/status");
    return result.providers;
  },
};

export const CAPABILITY_LABELS: Record<Capability, string> = {
  text_generation: "Content writing",
  translation: "Translation",
  image_generation: "Image generation",
  video_generation: "Video generation",
  voice_generation: "Voice generation",
  music_generation: "Music generation",
  video_editing: "Video editing",
  publishing: "Publishing",
};
