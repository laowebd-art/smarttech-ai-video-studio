// ============================================================================
// AI Router — core types.
//
// A "capability" is a task category (write text, generate a voice clip,
// generate an image, ...) — not a provider name. The frontend and the rest
// of the backend only ever ask the router for a capability; they never
// import or reference a specific provider. Adding, removing, reordering, or
// disabling a provider is a registration change (server/lib/adapters/*) plus
// a `provider_configs` row — nothing in routes/ or the frontend changes.
// ============================================================================

export type Capability =
  | "text_generation" // scripts, improvements, scene breakdowns, captions
  | "translation"
  | "image_generation"
  | "video_generation"
  | "voice_generation" // TTS
  | "music_generation"
  | "video_editing"
  | "publishing";

export interface AdapterContext {
  userId: string;
  projectId?: string | null;
  /** Short machine-readable label for usage logging, e.g. "script_generate". */
  feature: string;
}

export interface AdapterResult<TOutput> {
  data: TOutput;
  /** Must match the adapter's own `providerName` — used for usage logs and fallback reporting. */
  providerName: string;
  tokensUsed?: number | null;
  costEstimate?: number | null;
}

export interface ProviderAdapter<TInput = any, TOutput = any> {
  /** Unique adapter id, e.g. "openai-text", "elevenlabs-voice". */
  readonly id: string;
  /** Human/DB-facing provider name, e.g. "openai", "elevenlabs". Matches provider_configs.provider_name. */
  readonly providerName: string;
  /** One adapter can legitimately serve more than one capability (e.g. one LLM does both writing and translation). */
  readonly capabilities: Capability[];
  /** Cheap, synchronous check — typically "is the required API key present". */
  isConfigured(): boolean;
  execute(input: TInput, ctx: AdapterContext): Promise<AdapterResult<TOutput>>;
}

export class ProviderNotAvailableError extends Error {
  constructor(capability: Capability) {
    super(`No adapter is registered for capability "${capability}".`);
    this.name = "ProviderNotAvailableError";
  }
}

export class AllProvidersFailedError extends Error {
  constructor(
    public capability: Capability,
    public attempts: Array<{ provider: string; reason: string }>
  ) {
    super(
      `Every provider for "${capability}" failed or is unconfigured: ` +
        attempts.map((a) => `${a.provider} (${a.reason})`).join("; ")
    );
    this.name = "AllProvidersFailedError";
  }
}
