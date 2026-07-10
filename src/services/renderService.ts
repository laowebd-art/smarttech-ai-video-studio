import { apiGet, apiPost } from "@/lib/apiClient";
import type { RenderJob, ExportedVideo } from "@/types";

export interface RenderJobWithProject extends RenderJob {
  project?: { title: string };
}

export interface ExportedVideoWithProject extends ExportedVideo {
  project?: { title: string; user_id: string };
}

export const renderService = {
  async start(projectId: string): Promise<RenderJob> {
    const result = await apiPost<{ job: RenderJob }>("/api/render/start", { projectId });
    return result.job;
  },

  async getJob(jobId: string, projectId: string): Promise<RenderJob> {
    const result = await apiGet<{ job: RenderJob }>(`/api/render/job/${jobId}?projectId=${encodeURIComponent(projectId)}`);
    return result.job;
  },

  async listJobs(projectId?: string): Promise<RenderJobWithProject[]> {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    const result = await apiGet<{ jobs: RenderJobWithProject[] }>(`/api/render/jobs${qs}`);
    return result.jobs;
  },

  async listExports(projectId?: string): Promise<ExportedVideoWithProject[]> {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    const result = await apiGet<{ exports: ExportedVideoWithProject[] }>(`/api/render/exports${qs}`);
    return result.exports;
  },

  async getDownloadUrl(exportId: string, projectId: string): Promise<string> {
    const result = await apiGet<{ signedUrl: string }>(
      `/api/render/download/${exportId}?projectId=${encodeURIComponent(projectId)}`
    );
    return result.signedUrl;
  },
};
