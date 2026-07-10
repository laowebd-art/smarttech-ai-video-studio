import type { AdapterContext } from "../../router/types";
import type { AsyncProviderAdapter, AsyncStatusResult, VideoGenInput } from "../../router/asyncTypes";

// Official Runway API: Bearer token + required X-Runway-Version header.
// Task-based: POST /text_to_video or /image_to_video -> { id }; poll
// GET /tasks/{id} until status is SUCCEEDED/FAILED. Supports cancellation
// via DELETE /tasks/{id}. Docs: https://docs.dev.runwayml.com/api/
const API_VERSION = "2024-11-06";

function baseUrl(): string {
  return process.env.RUNWAY_API_BASE_URL || "https://api.dev.runwayml.com/v1";
}

function headers(): Record<string, string> {
  const key = process.env.RUNWAY_API_KEY;
  if (!key) throw new Error("RUNWAY_API_KEY is not configured on the server.");
  return { Authorization: `Bearer ${key}`, "X-Runway-Version": API_VERSION, "Content-Type": "application/json" };
}

function mapRatio(ratio: string | undefined, hasImage: boolean): string {
  // Runway uses explicit WIDTH:HEIGHT pixel ratios, not "9:16" shorthand.
  // 1080:1920 is Runway's documented vertical option; 1280:720 is a safe
  // horizontal default for text-to-video when no ratio is specified.
  if (ratio === "16:9") return "1280:720";
  if (ratio === "9:16") return "1080:1920";
  return hasImage ? "1080:1920" : "1280:720";
}

export const runwayVideoAdapter: AsyncProviderAdapter<VideoGenInput> = {
  id: "runway-video",
  providerName: "runway",
  capabilities: ["video_generation"],

  isConfigured() {
    return Boolean(process.env.RUNWAY_API_KEY);
  },

  async submit(input: VideoGenInput, _ctx: AdapterContext) {
    const isImageMode = input.mode === "image_to_video";
    if (isImageMode && !input.imageUrl) throw new Error("imageUrl is required for image-to-video generation.");

    const path = isImageMode ? "/image_to_video" : "/text_to_video";
    const body: Record<string, unknown> = {
      model: process.env.RUNWAY_MODEL || "gen4_turbo",
      promptText: input.prompt,
      ratio: mapRatio(input.aspectRatio, isImageMode),
      duration: input.durationSeconds && input.durationSeconds <= 5 ? 5 : 10,
    };
    if (isImageMode) body.promptImage = input.imageUrl;

    const response = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });

    const json: any = await response.json().catch(() => null);
    if (!response.ok || !json?.id) {
      throw new Error(`Runway API error (${response.status}): ${json?.error ?? ""}`.slice(0, 300));
    }

    return { externalJobId: json.id as string };
  },

  async checkStatus(externalJobId: string): Promise<AsyncStatusResult> {
    const response = await fetch(`${baseUrl()}/tasks/${externalJobId}`, { headers: headers() });
    const json: any = await response.json().catch(() => null);
    if (!response.ok) {
      return { status: "failed", errorMessage: `Runway status check failed (${response.status}): ${json?.error ?? ""}`.slice(0, 300) };
    }

    const status = json.status as string;
    if (status === "SUCCEEDED") {
      const url = json.output?.[0];
      if (!url) return { status: "failed", errorMessage: "Runway reported success but returned no output." };
      return { status: "completed", resultUrl: url, progress: 100 };
    }
    if (status === "FAILED") return { status: "failed", errorMessage: json.failure || "Runway generation failed." };
    if (status === "CANCELLED") return { status: "cancelled" };
    if (status === "RUNNING") return { status: "processing", progress: json.progress ? Math.round(json.progress * 100) : 50 };
    return { status: "processing", progress: 5 }; // PENDING / THROTTLED
  },

  async cancel(externalJobId: string): Promise<void> {
    const response = await fetch(`${baseUrl()}/tasks/${externalJobId}`, { method: "DELETE", headers: headers() });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to cancel Runway task (${response.status}).`);
    }
  },
};
