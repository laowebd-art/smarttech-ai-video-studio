import type { AdapterContext, AdapterResult, ProviderAdapter } from "../../router/types";
import type { VoiceGenInput, VoiceGenOutput, VoiceStyle } from "./openaiTtsAdapter";

// ElevenLabs voice IDs are account-specific (created/cloned per account), so
// there's no universal style->voice mapping. Configure ELEVENLABS_VOICE_ID
// as your default voice, or set a per-style override like
// ELEVENLABS_VOICE_ID_CALM / ELEVENLABS_VOICE_ID_ENERGETIC etc.
function resolveVoiceId(style: VoiceStyle): string | null {
  const styleKey = `ELEVENLABS_VOICE_ID_${style.toUpperCase()}`;
  return process.env[styleKey] || process.env.ELEVENLABS_VOICE_ID || null;
}

export const elevenLabsTtsAdapter: ProviderAdapter<VoiceGenInput, VoiceGenOutput> = {
  id: "elevenlabs-voice",
  providerName: "elevenlabs",
  capabilities: ["voice_generation"],

  isConfigured() {
    return Boolean(process.env.ELEVENLABS_API_KEY) && Boolean(process.env.ELEVENLABS_VOICE_ID);
  },

  async execute(input, _ctx: AdapterContext): Promise<AdapterResult<VoiceGenOutput>> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured on the server.");
    const voiceId = resolveVoiceId(input.voiceStyle);
    if (!voiceId) throw new Error(`No ElevenLabs voice configured for style "${input.voiceStyle}".`);
    const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey, Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: input.text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs API error (${response.status}): ${errText.slice(0, 300)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      data: { buffer: Buffer.from(arrayBuffer), contentType: "audio/mpeg" },
      providerName: "elevenlabs",
    };
  },
};
