import { signHS256Jwt } from "../shared/jwt";
import type { AdapterContext } from "../../router/types";
import type { AsyncProviderAdapter, AsyncStatusResult, VideoGenInput } from "../../router/asyncTypes";

// Official Kling API: JWT (HS256) auth signed with an Access Key / Secret
// Key pair, sent as a Bearer token. Tokens are short-lived (we mint a fresh
// one per call rather than caching, to avoid any clock-skew edge cases).
// Task-based: submit -> poll GET by task_id until task_status is
// succeed/failed. Docs: https://kling.ai/document-api
function baseUrl(): string {
  return process.env.KLING_API_BASE_URL || "https://api.klingai.com";
}

function authHeader(): string {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error("KLING_ACCESS_KEY / KLING_SECRET_KEY are not configured on the server.");
  const now = Math.floor(Date.now() / 1000);
  const token = signHS256Jwt({ iss: accessKey, exp: now + 1800, nbf: now - 5 }, secretKey);
  return `Bearer ${token}`;
}

function mapAspectRatio(ratio?: string): string {
  // Kling accepts "16:9" | "9:16" | "1:1" — pass through common ratios, default vertical for short-form video.
  if (ratio === "16:9" || ratio === "1:1") return ratio;
  return "9:16";
}

export const klingVideoAdapter: AsyncProviderAdapter<VideoGenInput> = {
  id: "kling-video",
  providerName: "kling",
  capabilities: ["video_generation"],

  isConfigured() {
    return Boolean(process.env.KLING_ACCESS_KEY) && Boolean(process.env.KLING_SECRET_KEY);
  },

  async submit(input: VideoGenInput, _ctx: AdapterContext) {
    const isImageMode = input.mode === "image_to_video";
    if (isImageMode && !input.imageUrl) throw new Error("imageUrl is required for image-to-video generation.");

    const path = isImageMode ? "/v1/videos/image2video" : "/v1/videos/text2video";
    const body: Record<string, unknown> = {
      model_name: process.env.KLING_MODEL || "kling-v1",
      prompt: input.prompt,
      duration: String(input.durationSeconds && input.durationSeconds <= 5 ? 5 : 10),
      aspect_ratio: mapAspectRatio(input.aspectRatio),
    };
    if (isImageMode) body.image = input.imageUrl;

    const response = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json: any = await response.json().catch(() => null);
    if (!response.ok || !json?.data?.task_id) {
      throw new Error(`Kling API error (${response.status}): ${json?.message ?? (await response.text().catch(() => ""))}`.slice(0, 300));
    }

    return { externalJobId: `${isImageMode ? "i2v" : "t2v"}:${json.data.task_id}` };
  },

  async checkStatus(externalJobId: string): Promise<AsyncStatusResult> {
    const [kind, taskId] = externalJobId.split(":");
    const path = kind === "i2v" ? `/v1/videos/image2video/${taskId}` : `/v1/videos/text2video/${taskId}`;

    const response = await fetch(`${baseUrl()}${path}`, {
      headers: { Authorization: authHeader() },
    });
    const json: any = await response.json().catch(() => null);
    if (!response.ok || !json?.data) {
      return { status: "failed", errorMessage: `Kling status check failed (${response.status}): ${json?.message ?? ""}`.slice(0, 300) };
    }

    const status = json.data.task_status as string;
    if (status === "succeed") {
      const videoUrl = json.data.task_result?.videos?.[0]?.url;
      if (!videoUrl) return { status: "failed", errorMessage: "Kling reported success but returned no video URL." };
      return { status: "completed", resultUrl: videoUrl, progress: 100 };
    }
    if (status === "failed") {
      return { status: "failed", errorMessage: json.data.task_status_msg || "Kling generation failed." };
    }
    // "submitted" | "processing"
    return { status: "processing", progress: status === "processing" ? 50 : 10 };
  },

  // Kling's public API does not document a cancel/delete-task endpoint as of
  // this writing — cancellation is therefore not offered for this provider.
};
