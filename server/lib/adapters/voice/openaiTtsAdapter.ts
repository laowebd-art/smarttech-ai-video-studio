import type { AdapterContext, AdapterResult, ProviderAdapter } from "../../router/types";

export type VoiceStyle = "calm" | "serious" | "emotional" | "energetic" | "documentary" | "friendly";

export interface VoiceGenInput {
  text: string;
  voiceStyle: VoiceStyle;
}

export interface VoiceGenOutput {
  buffer: Buffer;
  contentType: string;
}

// OpenAI's stock voices don't have named "styles", so we map our style
// picker to the closest-sounding stock voice. Tune these to taste.
const OPENAI_VOICE_MAP: Record<VoiceStyle, string> = {
  calm: "shimmer",
  serious: "onyx",
  emotional: "nova",
  energetic: "echo",
  documentary: "fable",
  friendly: "alloy",
};

export const openaiTtsAdapter: ProviderAdapter<VoiceGenInput, VoiceGenOutput> = {
  id: "openai-voice",
  providerName: "openai",
  capabilities: ["voice_generation"],

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  },

  async execute(input, _ctx: AdapterContext): Promise<AdapterResult<VoiceGenOutput>> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
    const model = process.env.OPENAI_TTS_MODEL || "tts-1";
    const voice = OPENAI_VOICE_MAP[input.voiceStyle] || "alloy";

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, voice, input: input.text, response_format: "mp3" }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI TTS error (${response.status}): ${errText.slice(0, 300)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      data: { buffer: Buffer.from(arrayBuffer), contentType: "audio/mpeg" },
      providerName: "openai",
    };
  },
};
