import { Router } from "express";
import type { Response } from "express";
import { generateJson } from "../lib/aiProviders";
import { logAiUsage } from "../lib/usageLog";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { requireAuth, verifyProjectOwnership, type AuthedRequest } from "../lib/auth";

export const aiRouter = Router();

aiRouter.use(requireAuth);
aiRouter.use(verifyProjectOwnership);

const TONES = ["emotional", "educational", "motivational", "story", "news", "product ad", "documentary"];

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

  const system = [
    "You are an expert short-form video scriptwriter for YouTube Shorts, TikTok, and Instagram/Facebook Reels.",
    "You write tight, spoken-word scripts meant to be read aloud in a vertical video, not written prose.",
    "Always return a JSON object with exactly these keys: hook, mainContent, cta, finalScript.",
    "`finalScript` must be the hook + mainContent + cta combined into one natural spoken script.",
    "Keep the total script speakable within the requested target duration at a natural speaking pace (~2.5 words/second).",
    "Do not use hashtags, emojis, or stage directions inside the script text.",
  ].join(" ");

  const user = [
    `Topic: ${topic}`,
    `Tone: ${tone || "educational"}`,
    `Target duration: ${durationTarget || 30} seconds`,
    `Language: ${language || "en"}`,
    rawScript ? `The user already has a rough draft to build from:\n${rawScript}` : "No rough draft provided — write from scratch.",
  ].join("\n");

  try {
    const result = await generateJson(system, user);
    await logAiUsage({
      userId: req.userId!,
      projectId,
      feature: "script_generate",
      provider: result.provider,
      tokensUsed: result.tokensUsed,
    });
    res.json({
      hook: result.json.hook ?? "",
      mainContent: result.json.mainContent ?? "",
      cta: result.json.cta ?? "",
      finalScript: result.json.finalScript ?? "",
    });
  } catch (err: any) {
    console.error("[generate-script]", err);
    res.status(502).json({ error: err.message ?? "Failed to generate script." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/improve-script
// ---------------------------------------------------------------------------
aiRouter.post("/improve-script", async (req: AuthedRequest, res: Response) => {
  const { script, tone, language, projectId } = req.body ?? {};

  if (!script || typeof script !== "string") {
    return res.status(400).json({ error: "`script` is required." });
  }

  const system = [
    "You are a professional short-form video script editor.",
    "Improve the given script for hook strength, pacing, clarity, and spoken-word flow, while keeping the same core message and roughly the same length.",
    "Return a JSON object with exactly one key: improvedScript.",
  ].join(" ");

  const user = [
    `Tone: ${tone || "educational"}`,
    `Language: ${language || "en"}`,
    `Script to improve:\n${script}`,
  ].join("\n");

  try {
    const result = await generateJson(system, user);
    await logAiUsage({
      userId: req.userId!,
      projectId,
      feature: "script_improve",
      provider: result.provider,
      tokensUsed: result.tokensUsed,
    });
    res.json({ improvedScript: result.json.improvedScript ?? script });
  } catch (err: any) {
    console.error("[improve-script]", err);
    res.status(502).json({ error: err.message ?? "Failed to improve script." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/split-scenes
// ---------------------------------------------------------------------------
aiRouter.post("/split-scenes", async (req: AuthedRequest, res: Response) => {
  const { script, durationTarget, language, projectId } = req.body ?? {};

  if (!script || typeof script !== "string") {
    return res.status(400).json({ error: "`script` is required." });
  }

  const system = [
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

  const user = [
    `Target total duration: ${durationTarget || 30} seconds`,
    `Language: ${language || "en"}`,
    `Script:\n${script}`,
  ].join("\n");

  try {
    const result = await generateJson(system, user);
    const scenes = Array.isArray(result.json.scenes) ? result.json.scenes : [];
    await logAiUsage({
      userId: req.userId!,
      projectId,
      feature: "scene_split",
      provider: result.provider,
      tokensUsed: result.tokensUsed,
    });
    res.json({ scenes });
  } catch (err: any) {
    console.error("[split-scenes]", err);
    res.status(502).json({ error: err.message ?? "Failed to split script into scenes." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/regenerate-scene
// ---------------------------------------------------------------------------
aiRouter.post("/regenerate-scene", async (req: AuthedRequest, res: Response) => {
  const { voiceoverText, tone, language, projectId } = req.body ?? {};

  if (!voiceoverText || typeof voiceoverText !== "string") {
    return res.status(400).json({ error: "`voiceoverText` is required." });
  }

  const system = [
    "You rewrite a single scene of a short-form video script.",
    "Return a JSON object with exactly these keys: voiceover_text, subtitle_text, visual_prompt, broll_keyword.",
    "Keep roughly the same length and meaning as the original, but improve wording and flow.",
    "broll_keyword must be 2-4 words suitable as a stock footage search query.",
  ].join(" ");

  const user = [`Tone: ${tone || "educational"}`, `Language: ${language || "en"}`, `Original scene text: ${voiceoverText}`].join(
    "\n"
  );

  try {
    const result = await generateJson(system, user);
    await logAiUsage({
      userId: req.userId!,
      projectId,
      feature: "scene_regenerate",
      provider: result.provider,
      tokensUsed: result.tokensUsed,
    });
    res.json({
      voiceover_text: result.json.voiceover_text ?? voiceoverText,
      subtitle_text: result.json.subtitle_text ?? voiceoverText,
      visual_prompt: result.json.visual_prompt ?? "",
      broll_keyword: result.json.broll_keyword ?? "",
    });
  } catch (err: any) {
    console.error("[regenerate-scene]", err);
    res.status(502).json({ error: err.message ?? "Failed to regenerate scene." });
  }
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

  const system = [
    "You write concrete, vivid visual descriptions for short-form video B-roll — suitable as either an AI image generation prompt or a stock footage search query.",
    "Return a JSON object with exactly one key: visualPrompt, a single descriptive sentence.",
    "Describe camera framing, subject, setting, lighting, and mood. Avoid abstract or unfilmable concepts.",
  ].join(" ");

  const user = [
    scene.voiceover_text ? `Scene voice-over: ${scene.voiceover_text}` : null,
    scene.broll_keyword ? `Existing B-roll keyword: ${scene.broll_keyword}` : null,
    scene.visual_prompt ? `Existing visual prompt to improve on: ${scene.visual_prompt}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await generateJson(system, user);
    await logAiUsage({
      userId: req.userId!,
      projectId,
      feature: "visual_prompt_generate",
      provider: result.provider,
      tokensUsed: result.tokensUsed,
    });
    res.json({ visualPrompt: result.json.visualPrompt ?? "" });
  } catch (err: any) {
    console.error("[generate-visual-prompt]", err);
    res.status(502).json({ error: err.message ?? "Failed to generate visual prompt." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/ai/captions-hashtags
// ---------------------------------------------------------------------------
aiRouter.post("/captions-hashtags", async (req: AuthedRequest, res: Response) => {
  const { topic, script, projectId } = req.body ?? {};

  if (!topic && !script) {
    return res.status(400).json({ error: "Provide at least `topic` or `script`." });
  }

  const system = [
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

  const user = [topic ? `Topic: ${topic}` : null, script ? `Script:\n${script}` : null].filter(Boolean).join("\n");

  try {
    const result = await generateJson(system, user);
    await logAiUsage({
      userId: req.userId!,
      projectId,
      feature: "caption_generate",
      provider: result.provider,
      tokensUsed: result.tokensUsed,
    });
    res.json({
      youtube: result.json.youtube ?? "",
      tiktok: result.json.tiktok ?? "",
      facebook: result.json.facebook ?? "",
      instagram: result.json.instagram ?? "",
      shortDescription: result.json.shortDescription ?? "",
      hashtags: Array.isArray(result.json.hashtags) ? result.json.hashtags : [],
      alternativeHooks: Array.isArray(result.json.alternativeHooks) ? result.json.alternativeHooks : [],
    });
  } catch (err: any) {
    console.error("[captions-hashtags]", err);
    res.status(502).json({ error: err.message ?? "Failed to generate captions and hashtags." });
  }
});
