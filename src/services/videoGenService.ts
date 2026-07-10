import { apiPost, apiGet } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { slugifyFilename } from "@/lib/utils";
import type { AiGenerationJob, VideoGenMode } from "@/types";

export interface GenerateVideoInput {
  mode: VideoGenMode;
  prompt: string;
  imageUrl?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  projectId?: string;
  sceneId?: string;
}

export const videoGenService = {
  /**
   * Uploads a source image for image-to-video generation and returns a
   * signed URL — providers like Kling and Runway fetch this URL themselves
   * server-side, so a 2-hour signed URL (long enough to cover generation
   * time) works the same as a public one without making the bucket public.
   */
  async uploadSourceImage(file: File): Promise<string> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");

    const path = `${user.id}/ai-video-studio/${Date.now()}-${slugifyFilename(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("project-visuals").upload(path, file, {
      contentType: file.type,
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase.storage.from("project-visuals").createSignedUrl(path, 7200);
    if (error || !data) throw new Error(error?.message ?? "Failed to create a signed URL for the uploaded image.");
    return data.signedUrl;
  },

  async generate(input: GenerateVideoInput): Promise<AiGenerationJob> {
    const result = await apiPost<{ job: AiGenerationJob }>("/api/video/generate", { ...input });
    return result.job;
  },

  async getJob(jobId: string): Promise<AiGenerationJob> {
    const result = await apiGet<{ job: AiGenerationJob }>(`/api/video/jobs/${jobId}`);
    return result.job;
  },

  async listJobs(projectId?: string): Promise<AiGenerationJob[]> {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    const result = await apiGet<{ jobs: AiGenerationJob[] }>(`/api/video/jobs${qs}`);
    return result.jobs;
  },

  async retry(jobId: string): Promise<AiGenerationJob> {
    const result = await apiPost<{ job: AiGenerationJob }>(`/api/video/jobs/${jobId}/retry`, {});
    return result.job;
  },

  async cancel(jobId: string): Promise<AiGenerationJob> {
    const result = await apiPost<{ job: AiGenerationJob }>(`/api/video/jobs/${jobId}/cancel`, {});
    return result.job;
  },

  async getDownloadUrl(jobId: string): Promise<string> {
    const result = await apiGet<{ url: string }>(`/api/video/jobs/${jobId}/download`);
    return result.url;
  },
};
