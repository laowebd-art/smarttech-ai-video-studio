import { Router } from "express";
import type { Response } from "express";
import { routeTask } from "../lib/router/router";
import { AllProvidersFailedError, ProviderNotAvailableError } from "../lib/router/types";
import type { TextGenInput } from "../lib/adapters/text/openaiTextAdapter";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { requireAuth, verifyProjectOwnership, type AuthedRequest } from "../lib/auth";

export const aiRouter = Router();

aiRouter.use(requireAuth);
aiRouter.use(verifyProjectOwnership);

const TONES = ["emotional", "educational", "motivational", "story", "news", "product ad", "documentary"];

/** Routes a text-generation task and turns router-level failures into clean HTTP responses. */
async function routeText(input: TextGenInput, ctx: { userId: string; projectId?: string; feature: string }, res: Response): Promise<any | null> {
  try {
    const result = await routeTask("text_generation", input, ctx);
    return result.data;
  } catch (err: any) {
    if (err instanceof ProviderNotAvailableError) {
      res.status(503).json({ error: "No AI text provider is registered on this server." });
    } else if (err instanceof AllProvidersFailedError) {
      console.error(`[AIRouter] ${ctx.feature}:`, err.message);
      res.status(502).json({ error: "AI generation failed on every configured provider. Please try again shortly." });
    } else {
      console.error(`[${ctx.feature}]`, err);
      res.status(502).json({ error: err.message ?? "AI generation failed." });
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// POST /api/ai/generate-script
// ---------------------------------------------------------------------------
aiRouter.post("/generate-script", async (req: AuthedRequest, res: Response) => {
  const { topic, tone, durationTarget, language, rawScript, projectId } = req.body ?? {};

  if (!topic || typeof topic !== "string") {
    return res.status(400).json({ error: "`topic` is required." });
  }
  if (tone && !TONES.includes(tone)) {
    return res.status(400).json({ error: `\`tone\` must be one of: ${TONES.join(", ")}` });
  }

  const systemPrompt = [
    "You are an expert short-form video scriptwriter for YouTube Shorts, TikTok, and Instagram/Facebook Reels.",
    "You write tight, spoken-word scripts meant to be read aloud in a vertical video, not written prose.",
    "Always return a JSON object with exactly these keys: hook, mainContent, cta, finalScript.",
    "`finalScript` must be the hook + mainContent + cta combined into one natural spoken script.",
    "Keep the total script speakable within the requested target duration at a natural speaking pace (~2.5 words/second).",
    "Do not use hashtags, emojis, or stage directions inside the script text.",
  ].join(" ");

  const userPrompt = [
    `Topic: ${topic}`,
    `Tone: ${tone || "educational"}`,
    `Target duration: ${durationTarget || 30} seconds`,
    `Language: ${language || "en"}`,
    rawScript ? `The user already has a rough draft to build from:\n${rawScript}` : "No rough draft provided — write from scratch.",
  ].join("\n");

  const json = await routeText({ systemPrompt, userPrompt }, { userId: req.userId!, projectId, feature: "script_generate" }, res);
  if (json === null) return;

  res.json({
    hook: json.hook ?? "",
    mainContent: json.mainContent ?? "",
    cta: json.cta ?? "",
    finalScript: json.finalScript ?? "",
  });
});

// ---------------------------------------------------------------------------
// POST /api/ai/improve-script
// ---------------------------------------------------------------------------
aiRouter.post("/improve-script", async (req: AuthedRequest, res: Response) => {
  const { script, tone, language, projectId } = req.body ?? {};

  if (!script || typeof script !== "string") {
    return res.status(400).json({ error: "`script` is required." });
  }

  const systemPrompt = [
    "You are a professional short-form video script editor.",
    "Improve the given script for hook strength, pacing, clarity, and spoken-word flow, while keeping the same core message and roughly the same length.",
    "Return a JSON object with exactly one key: improvedScript.",
  ].join(" ");

  const userPrompt = [
    `Tone: ${tone || "educational"}`,
    `Language: ${language || "en"}`,
    `Script to improve:\n${script}`,
  ].join("\n");

  const json = await routeText({ systemPrompt, userPrompt }, { userId: req.userId!, projectId, feature: "script_improve" }, res);
  if (json === null) return;

  res.json({ improvedScript: json.improvedScript ?? script });
});

// ---------------------------------------------------------------------------
// POST /api/ai/split-scenes
// ---------------------------------------------------------------------------
aiRouter.post("/split-scenes", async (req: AuthedRequest, res: Response) => {
  const { script, durationTarget, language, projectId } = req.body ?? {};

  if (!script || typeof script !== "string") {
    return res.status(400).json({ error: "`script` is required." });
  }

  const systemPrompt = [
    "You break a short-form video script into scenes for production.",
    "Return a JSON object with exactly one key: scenes, an array of objects.",
    "Each scene object must have exactly these keys:",
    "scene_number (integer, starting at 1), voiceover_text (string, a natural spoken segment of the script),",
    "subtitle_text (string, usually the same as voiceover_text but may be shortened for on-screen readability),",
    "visual_prompt (string, a concrete visual description an editor or AI image generator could use),",
    "broll_keyword (string, 2-4 words suitable as a stock footage search query),",
    "duration_seconds (number, estimated seconds this scene takes to speak at ~2.5 words/second).",
    "Scenes must cover the entire script in order with nothing omitted, and the sum of duration_seconds should be close to the target duration.",
  ].join(" ");

  const userPrompt = [
    `Target total duration: ${durationTarget || 30} seconds`,
    `Language: ${language || "en"}`,
    `Script:\n${script}`,
  ].join("\n");

  const json = await routeText({ systemPrompt, userPrompt }, { userId: req.userId!, projectId, feature: "scene_split" }, res);
  if (json === null) return;

  res.json({ scenes: Array.isArray(json.scenes) ? json.scenes : [] });
});

// ---------------------------------------------------------------------------
// POST /api/ai/regenerate-scene
// ---------------------------------------------------------------------------
aiRouter.post("/regenerate-scene", async (req: AuthedRequest, res: Response) => {
  const { voiceoverText, tone, language, projectId } = req.body ?? {};

  if (!voiceoverText || typeof voiceoverText !== "string") {
    return res.status(400).json({ error: "`voiceoverText` is required." });
  }

  const systemPrompt = [
    "You rewrite a single scene of a short-form video script.",
    "Return a JSON object with exactly these keys: voiceover_text, subtitle_text, visual_prompt, broll_keyword.",
    "Keep roughly the same length and meaning as the original, but improve wording and flow.",
    "broll_keyword must be 2-4 words suitable as a stock footage search query.",
  ].join(" ");

  const userPrompt = [`Tone: ${tone || "educational"}`, `Language: ${language || "en"}`, `Original scene text: ${voiceoverText}`].join(
    "\n"
  );

  const json = await routeText({ systemPrompt, userPrompt }, { userId: req.userId!, projectId, feature: "scene_regenerate" }, res);
  if (json === null) return;

  res.json({
    voiceover_text: json.voiceover_text ?? voiceoverText,
    subtitle_text: json.subtitle_text ?? voiceoverText,
    visual_prompt: json.visual_prompt ?? "",
    broll_keyword: json.broll_keyword ?? "",
  });
});

// ---------------------------------------------------------------------------
// POST /api/ai/generate-visual-prompt
// ---------------------------------------------------------------------------
aiRouter.post("/generate-visual-prompt", async (req: AuthedRequest, res: Response) => {
  const { sceneId, projectId } = req.body ?? {};

  if (!sceneId || !projectId) {
    return res.status(400).json({ error: "`sceneId` and `projectId` are required." });
  }

  const { data: scene, error: sceneError } = await supabaseAdmin
    .from("scenes")
    .select("voiceover_text, broll_keyword, visual_prompt")
    .eq("id", sceneId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (sceneError || !scene) {
    return res.status(404).json({ error: "Scene not found." });
  }

  const systemPrompt = [
    "You write concrete, vivid visual descriptions for short-form video B-roll — suitable as either an AI image generation prompt or a stock footage search query.",
    "Return a JSON object with exactly one key: visualPrompt, a single descriptive sentence.",
    "Describe camera framing, subject, setting, lighting, and mood. Avoid abstract or unfilmable concepts.",
  ].join(" ");

  const userPrompt = [
    scene.voiceover_text ? `Scene voice-over: ${scene.voiceover_text}` : null,
    scene.broll_keyword ? `Existing B-roll keyword: ${scene.broll_keyword}` : null,
    scene.visual_prompt ? `Existing visual prompt to improve on: ${scene.visual_prompt}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const json = await routeText({ systemPrompt, userPrompt }, { userId: req.userId!, projectId, feature: "visual_prompt_generate" }, res);
  if (json === null) return;

  res.json({ visualPrompt: json.visualPrompt ?? "" });
});

// ---------------------------------------------------------------------------
// POST /api/ai/captions-hashtags
// ---------------------------------------------------------------------------
aiRouter.post("/captions-hashtags", async (req: AuthedRequest, res: Response) => {
  const { topic, script, projectId } = req.body ?? {};

  if (!topic && !script) {
    return res.status(400).json({ error: "Provide at least `topic` or `script`." });
  }

  const systemPrompt = [
    "You write platform-native captions for short vertical videos.",
    "Return a JSON object with exactly these keys:",
    "youtube (a YouTube Shorts title, under 100 characters),",
    "tiktok (a short punchy TikTok caption),",
    "facebook (a Facebook Reel caption, slightly more descriptive),",
    "instagram (an Instagram Reel caption),",
    "shortDescription (1-2 sentence neutral description of the video),",
    "hashtags (an array of 5-10 relevant hashtag strings, each starting with #, no spaces),",
    "alternativeHooks (an array of exactly 3 alternative opening-line hooks for this video, each a single sentence).",
  ].join(" ");

  const userPrompt = [topic ? `Topic: ${topic}` : null, script ? `Script:\n${script}` : null].filter(Boolean).join("\n");

  const json = await routeText({ systemPrompt, userPrompt }, { userId: req.userId!, projectId, feature: "caption_generate" }, res);
  if (json === null) return;

  res.json({
    youtube: json.youtube ?? "",
    tiktok: json.tiktok ?? "",
    facebook: json.facebook ?? "",
    instagram: json.instagram ?? "",
    shortDescription: json.shortDescription ?? "",
    hashtags: Array.isArray(json.hashtags) ? json.hashtags : [],
    alternativeHooks: Array.isArray(json.alternativeHooks) ? json.alternativeHooks : [],
  });
});
