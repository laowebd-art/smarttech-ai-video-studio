import type { AdapterContext } from "../../router/types";
import type { AsyncProviderAdapter, AsyncStatusResult, VideoGenInput } from "../../router/asyncTypes";
import { signHS256Jwt } from "../shared/jwt";

// Kling's current developer console issues a single API key used as
// Authorization: Bearer <key>. Older accounts/docs used an Access Key /
// Secret Key JWT pair, so we keep that path as a fallback for existing envs.
function baseUrl(): string {
  return process.env.KLING_API_BASE_URL || (process.env.KLING_API_KEY ? "https://api-singapore.klingai.com" : "https://api.klingai.com");
}

function hasLegacyKeyPair(): boolean {
  return Boolean(process.env.KLING_ACCESS_KEY) && Boolean(process.env.KLING_SECRET_KEY);
}

function isModernApiKey(): boolean {
  return Boolean(process.env.KLING_API_KEY);
}

function authHeader(): { header: string; mode: "modern" | "legacy" } {
  const apiKey = process.env.KLING_API_KEY;
  if (apiKey) return { header: `Bearer ${apiKey}`, mode: "modern" };

  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error("KLING_API_KEY or KLING_ACCESS_KEY / KLING_SECRET_KEY are not configured on the server.");
  const now = Math.floor(Date.now() / 1000);
  const token = signHS256Jwt({ iss: accessKey, exp: now + 1800, nbf: now - 5 }, secretKey);
  return { header: `Bearer ${token}`, mode: "legacy" };
}

function mapAspectRatio(ratio?: string): string {
  // Kling accepts "16:9" | "9:16" | "1:1" — pass through common ratios, default vertical for short-form video.
  if (ratio === "16:9" || ratio === "1:1") return ratio;
  return "9:16";
}

function mapDuration(durationSeconds?: number): number {
  const rounded = durationSeconds ? Math.round(durationSeconds) : 5;
  return Math.min(Math.max(rounded, 3), 15);
}

export const klingVideoAdapter: AsyncProviderAdapter<VideoGenInput> = {
  id: "kling-video",
  providerName: "kling",
  capabilities: ["video_generation"],

  isConfigured() {
    return isModernApiKey() || hasLegacyKeyPair();
  },

  async submit(input: VideoGenInput, _ctx: AdapterContext) {
    const isImageMode = input.mode === "image_to_video";
    if (isImageMode && !input.imageUrl) throw new Error("imageUrl is required for image-to-video generation.");
    const auth = authHeader();

    if (auth.mode === "modern") {
      const modelPath = process.env.KLING_MODEL || "kling-3.0-turbo";
      const body: Record<string, unknown> = {
        settings: {
          duration: mapDuration(input.durationSeconds),
          resolution: process.env.KLING_RESOLUTION || "720p",
          ...(isImageMode ? {} : { aspect_ratio: mapAspectRatio(input.aspectRatio) }),
        },
        options: { watermark_info: { enabled: false } },
      };

      if (isImageMode) {
        body.contents = [
          { type: "prompt", text: input.prompt },
          { type: "first_frame", url: input.imageUrl },
        ];
      } else {
        body.prompt = input.prompt;
      }

      const path = `/${isImageMode ? "image-to-video" : "text-to-video"}/${modelPath}`;
      const response = await fetch(`${baseUrl()}${path}`, {
        method: "POST",
        headers: { Authorization: auth.header, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json: any = await response.json().catch(() => null);
      if (!response.ok || !json?.data?.id) {
        throw new Error(`Kling API error (${response.status}): ${json?.message ?? (await response.text().catch(() => ""))}`.slice(0, 300));
      }

      return { externalJobId: `modern:${json.data.id}` };
    }

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
      headers: { Authorization: auth.header, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json: any = await response.json().catch(() => null);
    if (!response.ok || !json?.data?.task_id) {
      throw new Error(`Kling API error (${response.status}): ${json?.message ?? (await response.text().catch(() => ""))}`.slice(0, 300));
    }

    return { externalJobId: `${isImageMode ? "i2v" : "t2v"}:${json.data.task_id}` };
  },

  async checkStatus(externalJobId: string): Promise<AsyncStatusResult> {
    const auth = authHeader();
    if (externalJobId.startsWith("modern:")) {
      const taskId = externalJobId.slice("modern:".length);
      const response = await fetch(`${baseUrl()}/tasks?task_ids=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: auth.header, "Content-Type": "application/json" },
      });
      const json: any = await response.json().catch(() => null);
      const task = Array.isArray(json?.data) ? json.data[0] : null;
      if (!response.ok || !task) {
        return { status: "failed", errorMessage: `Kling status check failed (${response.status}): ${json?.message ?? ""}`.slice(0, 300) };
      }

      if (task.status === "succeeded") {
        const videoUrl = task.outputs?.find((output: any) => output?.type === "video")?.url;
        if (!videoUrl) return { status: "failed", errorMessage: "Kling reported success but returned no video URL." };
        return { status: "completed", resultUrl: videoUrl, progress: 100 };
      }
      if (task.status === "failed") {
        return { status: "failed", errorMessage: task.message || "Kling generation failed." };
      }
      return { status: "processing", progress: task.status === "processing" ? 50 : 10 };
    }

    const [kind, taskId] = externalJobId.split(":");
    const path = kind === "i2v" ? `/v1/videos/image2video/${taskId}` : `/v1/videos/text2video/${taskId}`;

    const response = await fetch(`${baseUrl()}${path}`, {
      headers: { Authorization: auth.header },
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
