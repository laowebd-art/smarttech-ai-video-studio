// ============================================================================
// Text-to-Speech provider abstraction. Switch providers with
// TTS_PROVIDER=openai|elevenlabs in the server environment — nothing in
// routes/audio.ts needs to change.
// ============================================================================

export type VoiceStyle = "calm" | "serious" | "emotional" | "energetic" | "documentary" | "friendly";

export interface TtsResult {
  buffer: Buffer;
  provider: "openai" | "elevenlabs";
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

async function synthesizeOpenAi(text: string, style: VoiceStyle): Promise<TtsResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  const model = process.env.OPENAI_TTS_MODEL || "tts-1";
  const voice = OPENAI_VOICE_MAP[style] || "alloy";

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, voice, input: text, response_format: "mp3" }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI TTS error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), provider: "openai", contentType: "audio/mpeg" };
}

// ElevenLabs voice IDs are account-specific (created/cloned per account), so
// there's no universal style->voice mapping. Configure ELEVENLABS_VOICE_ID
// as your default voice, or set a per-style override like
// ELEVENLABS_VOICE_ID_CALM / ELEVENLABS_VOICE_ID_ENERGETIC etc.
function resolveElevenLabsVoiceId(style: VoiceStyle): string {
  const styleKey = `ELEVENLABS_VOICE_ID_${style.toUpperCase()}`;
  const override = process.env[styleKey];
  const fallback = process.env.ELEVENLABS_VOICE_ID;
  const voiceId = override || fallback;
  if (!voiceId) {
    throw new Error(
      `No ElevenLabs voice configured for style "${style}". Set ELEVENLABS_VOICE_ID (or ${styleKey}) in your server environment.`
    );
  }
  return voiceId;
}

async function synthesizeElevenLabs(text: string, style: VoiceStyle): Promise<TtsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured on the server.");
  const voiceId = resolveElevenLabsVoiceId(style);
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs API error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), provider: "elevenlabs", contentType: "audio/mpeg" };
}

export async function synthesizeSpeech(
  text: string,
  style: VoiceStyle,
  providerOverride?: string
): Promise<TtsResult> {
  const provider = (providerOverride || process.env.TTS_PROVIDER || "openai").toLowerCase();
  if (provider === "elevenlabs") return synthesizeElevenLabs(text, style);
  if (provider === "openai") return synthesizeOpenAi(text, style);
  throw new Error(`Unknown TTS provider "${provider}". Use "openai" or "elevenlabs".`);
}

/** Rough duration estimate until we decode real audio metadata: ~2.5 words/sec spoken pace. */
export function estimateDurationSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / 2.5) * 10) / 10);
}
