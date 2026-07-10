// ============================================================================
// Async provider adapters — for capabilities that don't return a result
// synchronously (video generation today; music/video-editing generation
// later will likely follow the same shape). Unlike the sync ProviderAdapter
// (router/types.ts), these submit a task to the provider and return an
// external job id immediately; the actual result is fetched later by polling.
// ============================================================================

import type { AdapterContext, Capability } from "./types";

export type VideoGenMode = "text_to_video" | "image_to_video";

export interface VideoGenInput {
  mode: VideoGenMode;
  prompt: string;
  /** Required when mode === "image_to_video". A publicly fetchable URL. */
  imageUrl?: string;
  durationSeconds?: number;
  /** e.g. "9:16" — adapters translate this to whatever format the provider expects. */
  aspectRatio?: string;
}

export type AsyncJobStatus = "processing" | "completed" | "failed" | "cancelled";

export interface AsyncStatusResult {
  status: AsyncJobStatus;
  /** 0-100 if the provider reports granular progress; most don't, so this is often omitted. */
  progress?: number;
  /** Set when status === "completed" — a URL the server can fetch to mirror the file into our own storage. */
  resultUrl?: string;
  errorMessage?: string;
}

export interface AsyncSubmitResult {
  externalJobId: string;
  providerName: string;
}

export interface AsyncProviderAdapter<TInput = any> {
  readonly id: string;
  readonly providerName: string;
  readonly capabilities: Capability[];
  isConfigured(): boolean;
  submit(input: TInput, ctx: AdapterContext): Promise<{ externalJobId: string }>;
  checkStatus(externalJobId: string): Promise<AsyncStatusResult>;
  /** Not every provider supports cancelling an in-flight generation — omit if unsupported. */
  cancel?(externalJobId: string): Promise<void>;
  /**
   * Most providers return a public/signed CDN URL that needs no extra
   * headers to fetch. A few (Google's Gemini-API-hosted files) require the
   * same API key used for generation to actually download the bytes —
   * implement this to supply those headers when mirroring the result into
   * our own storage.
   */
  getResultDownloadHeaders?(): Record<string, string>;
}

export class AsyncProviderNotAvailableError extends Error {
  constructor(capability: Capability) {
    super(`No async adapter is registered for capability "${capability}".`);
    this.name = "AsyncProviderNotAvailableError";
  }
}

export class AllAsyncProvidersFailedError extends Error {
  constructor(
    public capability: Capability,
    public attempts: Array<{ provider: string; reason: string }>
  ) {
    super(
      `Every provider for "${capability}" failed to accept the job: ` +
        attempts.map((a) => `${a.provider} (${a.reason})`).join("; ")
    );
    this.name = "AllAsyncProvidersFailedError";
  }
}
