import type { Capability, ProviderAdapter } from "../router/types";

/**
 * A placeholder adapter for providers this platform will integrate later
 * (image/video/music generation, video editing, social publishing). It
 * registers real capability slots — so the router, provider_configs table,
 * and any future "provider status" UI already know these providers exist —
 * without pretending they work. isConfigured() always returns false, so the
 * router skips it during normal routing and only surfaces a clear
 * "not implemented yet" error if it's ever the sole candidate.
 *
 * Swapping this out for a real implementation later is a one-file change:
 * write a real adapter with the same id/providerName and register it in
 * place of the stub in registerAdapters.ts.
 */
function comingSoonAdapter(id: string, providerName: string, capabilities: Capability[]): ProviderAdapter {
  return {
    id,
    providerName,
    capabilities,
    isConfigured: () => false,
    async execute() {
      throw new Error(`${providerName} is not implemented yet — this capability is planned for a future phase.`);
    },
  };
}

export const chatgptImageAdapter = comingSoonAdapter("chatgpt-image", "openai-images", ["image_generation"]);
export const fluxImageAdapter = comingSoonAdapter("flux-image", "flux", ["image_generation"]);

// video_generation is now served by real adapters — see
// server/lib/adapters/video/{kling,veo,runway}VideoAdapter.ts, registered
// in the async provider registry (asyncRegistry.ts), not here.

export const sunoMusicAdapter = comingSoonAdapter("suno-music", "suno", ["music_generation"]);

export const capcutEditAdapter = comingSoonAdapter("capcut-edit", "capcut", ["video_editing"]);
export const davinciEditAdapter = comingSoonAdapter("davinci-edit", "davinci-resolve", ["video_editing"]);

export const youtubePublishAdapter = comingSoonAdapter("youtube-publish", "youtube", ["publishing"]);
export const tiktokPublishAdapter = comingSoonAdapter("tiktok-publish", "tiktok", ["publishing"]);
export const facebookPublishAdapter = comingSoonAdapter("facebook-publish", "facebook", ["publishing"]);
