import { providerRegistry } from "../router/registry";
import { asyncProviderRegistry } from "../router/asyncRegistry";
import { openaiTextAdapter } from "./text/openaiTextAdapter";
import { anthropicTextAdapter } from "./text/anthropicTextAdapter";
import { openaiTtsAdapter } from "./voice/openaiTtsAdapter";
import { elevenLabsTtsAdapter } from "./voice/elevenLabsTtsAdapter";
import { klingVideoAdapter } from "./video/klingVideoAdapter";
import { veoVideoAdapter } from "./video/veoVideoAdapter";
import { runwayVideoAdapter } from "./video/runwayVideoAdapter";
import {
  chatgptImageAdapter,
  fluxImageAdapter,
  sunoMusicAdapter,
  capcutEditAdapter,
  davinciEditAdapter,
  youtubePublishAdapter,
  tiktokPublishAdapter,
  facebookPublishAdapter,
} from "./comingSoon";

let registered = false;

/**
 * Registers every known adapter exactly once. Call this at server startup
 * (server/index.ts) before any route can reach a router. Sync capabilities
 * (text, voice) go through providerRegistry + router.ts; async/job-based
 * capabilities (video generation today) go through asyncProviderRegistry +
 * asyncRouter.ts. This file is the single place that knows every provider
 * by name — everything downstream (routes, the frontend) only deals in
 * capabilities.
 */
export function registerAdapters(): void {
  if (registered) return;
  registered = true;

  // ---- Sync: live today ----
  providerRegistry.register(openaiTextAdapter);
  providerRegistry.register(anthropicTextAdapter);
  providerRegistry.register(openaiTtsAdapter);
  providerRegistry.register(elevenLabsTtsAdapter);

  // ---- Sync: registered as capability slots for future phases ----
  providerRegistry.register(chatgptImageAdapter);
  providerRegistry.register(fluxImageAdapter);
  providerRegistry.register(sunoMusicAdapter);
  providerRegistry.register(capcutEditAdapter);
  providerRegistry.register(davinciEditAdapter);
  providerRegistry.register(youtubePublishAdapter);
  providerRegistry.register(tiktokPublishAdapter);
  providerRegistry.register(facebookPublishAdapter);

  // ---- Async: live today (each isConfigured() gates on real env vars —
  // see each adapter file for exactly which ones) ----
  asyncProviderRegistry.register(klingVideoAdapter);
  asyncProviderRegistry.register(veoVideoAdapter);
  asyncProviderRegistry.register(runwayVideoAdapter);
}
