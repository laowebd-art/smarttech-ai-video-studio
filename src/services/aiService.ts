// ============================================================================
// AI Service — Phase 2.
//
// All real AI calls happen server-side (server/routes/ai.ts). This file only
// makes authenticated HTTP requests to that server via apiPost(); it never
// holds or sends an OpenAI/Anthropic API key itself. If the server call
// fails (e.g. no backend running, no API key configured yet), each function
// throws — callers should surface the error via a toast, which the Script
// Studio and Caption Generator UIs already do.
// ============================================================================

import { apiPost } from "@/lib/apiClient";
import type { Scene } from "@/types";

export interface ScriptGenerationInput {
  topic: string;
  tone: string;
  durationTarget: number;
  language: string;
  rawScript?: string;
  projectId: string;
}

export interface GeneratedScript {
  hook: string;
  mainContent: string;
  cta: string;
  finalScript: string;
}

export async function generateScript(input: ScriptGenerationInput): Promise<GeneratedScript> {
  return apiPost<GeneratedScript>("/api/ai/generate-script", { ...input });
}

export async function improveScript(script: string, projectId: string, tone?: string, language?: string): Promise<string> {
  const result = await apiPost<{ improvedScript: string }>("/api/ai/improve-script", {
    script,
    projectId,
    tone,
    language,
  });
  return result.improvedScript;
}

export type SceneDraft = Pick<
  Scene,
  "scene_number" | "voiceover_text" | "subtitle_text" | "visual_prompt" | "broll_keyword" | "duration_seconds"
>;

export async function splitIntoScenes(script: string, targetDuration: number, projectId: string, language?: string): Promise<SceneDraft[]> {
  const result = await apiPost<{ scenes: SceneDraft[] }>("/api/ai/split-scenes", {
    script,
    durationTarget: targetDuration,
    projectId,
    language,
  });
  return result.scenes;
}

export async function generateVisualPrompt(sceneId: string, projectId: string): Promise<string> {
  const result = await apiPost<{ visualPrompt: string }>("/api/ai/generate-visual-prompt", { sceneId, projectId });
  return result.visualPrompt;
}

export interface RegeneratedScene {
  voiceover_text: string;
  subtitle_text: string;
  visual_prompt: string;
  broll_keyword: string;
}

export async function regenerateScene(
  voiceoverText: string,
  projectId: string,
  tone?: string,
  language?: string
): Promise<RegeneratedScene> {
  return apiPost<RegeneratedScene>("/api/ai/regenerate-scene", { voiceoverText, projectId, tone, language });
}

export interface CaptionsAndHashtags {
  youtube: string;
  tiktok: string;
  facebook: string;
  instagram: string;
  shortDescription: string;
  hashtags: string[];
  alternativeHooks: string[];
}

export async function generateCaptionsAndHashtags(
  topic: string,
  script: string,
  projectId: string
): Promise<CaptionsAndHashtags> {
  return apiPost<CaptionsAndHashtags>("/api/ai/captions-hashtags", { topic, script, projectId });
}
