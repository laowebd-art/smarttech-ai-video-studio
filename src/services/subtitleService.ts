import { supabase } from "@/lib/supabase";
import type { Scene, SubtitleAsset, SubtitleTimingEntry } from "@/types";

export interface SubtitleSettings {
  style: SubtitleAsset["style"];
  position: SubtitleAsset["position"];
  fontSize: number;
}

function formatSrtTimestamp(totalSeconds: number): string {
  const ms = Math.round((totalSeconds % 1) * 1000);
  const totalWhole = Math.floor(totalSeconds);
  const h = Math.floor(totalWhole / 3600);
  const m = Math.floor((totalWhole % 3600) / 60);
  const s = totalWhole % 60;
  const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function buildTiming(scenes: Scene[]): SubtitleTimingEntry[] {
  let cursor = 0;
  return scenes
    .slice()
    .sort((a, b) => a.scene_number - b.scene_number)
    .map((scene) => {
      const start = cursor;
      const end = start + Number(scene.duration_seconds || 0);
      cursor = end;
      return {
        scene_id: scene.id,
        scene_number: scene.scene_number,
        start,
        end,
        text: scene.subtitle_text || scene.voiceover_text || "",
      };
    });
}

export function buildSrt(timing: SubtitleTimingEntry[]): string {
  return timing
    .map((entry, i) => {
      return `${i + 1}\n${formatSrtTimestamp(entry.start)} --> ${formatSrtTimestamp(entry.end)}\n${entry.text}\n`;
    })
    .join("\n");
}

async function findExisting(projectId: string): Promise<SubtitleAsset | null> {
  const { data } = await supabase
    .from("subtitle_assets")
    .select("*")
    .eq("project_id", projectId)
    .is("scene_id", null)
    .maybeSingle();
  return (data as SubtitleAsset) ?? null;
}

export const subtitleService = {
  async get(projectId: string): Promise<SubtitleAsset | null> {
    return findExisting(projectId);
  },

  async generate(projectId: string, scenes: Scene[], settings: SubtitleSettings): Promise<SubtitleAsset> {
    const timing = buildTiming(scenes);
    const srt = buildSrt(timing);
    const existing = await findExisting(projectId);

    const payload = {
      project_id: projectId,
      scene_id: null,
      style: settings.style,
      position: settings.position,
      font_size: settings.fontSize,
      timing_json: timing,
      srt_text: srt,
    };

    if (existing) {
      const { data, error } = await supabase
        .from("subtitle_assets")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as SubtitleAsset;
    }

    const { data, error } = await supabase.from("subtitle_assets").insert(payload).select().single();
    if (error) throw error;
    return data as SubtitleAsset;
  },

  downloadSrt(asset: SubtitleAsset, filename: string) {
    downloadTextFile(asset.srt_text ?? "", `${filename}.srt`, "application/x-subrip");
  },

  downloadJson(asset: SubtitleAsset, filename: string) {
    downloadTextFile(JSON.stringify(asset.timing_json, null, 2), `${filename}.json`, "application/json");
  },
};

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
