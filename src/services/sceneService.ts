import { supabase } from "@/lib/supabase";
import type { Scene } from "@/types";

export const sceneService = {
  async list(projectId: string): Promise<Scene[]> {
    const { data, error } = await supabase
      .from("scenes")
      .select("*")
      .eq("project_id", projectId)
      .order("scene_number");
    if (error) throw error;
    return (data as Scene[]) ?? [];
  },

  async create(projectId: string, sceneNumber: number, partial: Partial<Scene> = {}): Promise<Scene> {
    const { data, error } = await supabase
      .from("scenes")
      .insert({
        project_id: projectId,
        scene_number: sceneNumber,
        voiceover_text: partial.voiceover_text ?? "",
        subtitle_text: partial.subtitle_text ?? "",
        visual_prompt: partial.visual_prompt ?? "",
        broll_keyword: partial.broll_keyword ?? "",
        duration_seconds: partial.duration_seconds ?? 5,
        transition_type: partial.transition_type ?? "fade",
        background_music_mood: partial.background_music_mood ?? "neutral",
      })
      .select()
      .single();
    if (error) throw error;
    return data as Scene;
  },

  async update(sceneId: string, updates: Partial<Scene>): Promise<Scene> {
    const { data, error } = await supabase.from("scenes").update(updates).eq("id", sceneId).select().single();
    if (error) throw error;
    return data as Scene;
  },

  async remove(sceneId: string): Promise<void> {
    const { error } = await supabase.from("scenes").delete().eq("id", sceneId);
    if (error) throw error;
  },

  /** Persist a full reordered list, renumbering scene_number sequentially. */
  async reorder(scenes: Scene[]): Promise<void> {
    const updates = scenes.map((s, i) =>
      supabase.from("scenes").update({ scene_number: i + 1 }).eq("id", s.id)
    );
    await Promise.all(updates);
  },
};
