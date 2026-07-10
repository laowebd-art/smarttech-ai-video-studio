import type { AdapterContext } from "../../router/types";
import type { AsyncProviderAdapter, AsyncStatusResult, VideoGenInput } from "../../router/asyncTypes";

// Google Veo via the Gemini API (API-key auth — simplest path; the
// alternative Vertex AI path needs a GCP service account and is not used
// here). Long-running-operation pattern: POST ...:predictLongRunning
// returns an operation name; GET that operation until done=true.
// Docs: https://ai.google.dev/gemini-api/docs/video
function baseUrl(): string {
  return process.env.GOOGLE_VEO_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
}

function apiKey(): string {
  const key = process.env.GOOGLE_VEO_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GOOGLE_VEO_API_KEY (or GEMINI_API_KEY) is not configured on the server.");
  return key;
}

function model(): string {
  return process.env.GOOGLE_VEO_MODEL || "veo-3.0-generate-preview";
}

export const veoVideoAdapter: AsyncProviderAdapter<VideoGenInput> = {
  id: "veo-video",
  providerName: "google-veo",
  capabilities: ["video_generation"],

  isConfigured() {
    return Boolean(process.env.GOOGLE_VEO_API_KEY || process.env.GEMINI_API_KEY);
  },

  async submit(input: VideoGenInput, _ctx: AdapterContext) {
    if (input.mode === "image_to_video" && !input.imageUrl) {
      throw new Error("imageUrl is required for image-to-video generation.");
    }

    const instance: Record<string, unknown> = { prompt: input.prompt };
    if (input.mode === "image_to_video" && input.imageUrl) {
      // Veo's REST API accepts inline base64 image bytes, not a hosted URL,
      // so we fetch the image server-side first and inline it.
      const imgResponse = await fetch(input.imageUrl);
      if (!imgResponse.ok) throw new Error(`Failed to fetch source image for Veo (${imgResponse.status}).`);
      const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await imgResponse.arrayBuffer());
      instance.image = { bytesBase64Encoded: buffer.toString("base64"), mimeType: contentType };
    }

    const aspectRatio = input.aspectRatio === "16:9" ? "16:9" : "9:16";

    const response = await fetch(`${baseUrl()}/models/${model()}:predictLongRunning`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [instance], parameters: { aspectRatio } }),
    });

    const json: any = await response.json().catch(() => null);
    if (!response.ok || !json?.name) {
      throw new Error(`Google Veo API error (${response.status}): ${json?.error?.message ?? ""}`.slice(0, 300));
    }

    return { externalJobId: json.name as string };
  },

  async checkStatus(externalJobId: string): Promise<AsyncStatusResult> {
    const response = await fetch(`${baseUrl()}/${externalJobId}`, {
      headers: { "x-goog-api-key": apiKey() },
    });
    const json: any = await response.json().catch(() => null);
    if (!response.ok) {
      return { status: "failed", errorMessage: `Veo status check failed (${response.status}): ${json?.error?.message ?? ""}`.slice(0, 300) };
    }
    if (json?.error) {
      return { status: "failed", errorMessage: json.error.message ?? "Veo generation failed." };
    }
    if (!json?.done) {
      return { status: "processing" };
    }

    const videoUri =
      json.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ?? json.response?.videos?.[0]?.gcsUri;
    if (!videoUri) {
      return { status: "failed", errorMessage: "Veo reported completion but returned no video URI." };
    }
    return { status: "completed", resultUrl: videoUri, progress: 100 };
  },

  // The Gemini API does not expose an operation-cancellation endpoint for
  // video generation as of this writing — cancellation is not offered.

  getResultDownloadHeaders() {
    // The generatedSamples URI is served from the same generativelanguage
    // API surface and requires the API key to fetch, unlike Kling/Runway's
    // public CDN links.
    return { "x-goog-api-key": apiKey() };
  },
};
