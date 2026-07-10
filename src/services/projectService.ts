import { supabase } from "@/lib/supabase";
import type { Project, VideoFormat } from "@/types";

export interface CreateProjectInput {
  user_id: string;
  title: string;
  description?: string;
  topic?: string;
  language?: string;
  video_format?: VideoFormat;
  duration_target?: number;
  template_id?: string | null;
  tone?: string;
}

export const projectService = {
  async list(userId: string): Promise<Project[]> {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data as Project[]) ?? [];
  },

  async get(projectId: string): Promise<Project | null> {
    const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).single();
    if (error) throw error;
    return data as Project;
  },

  async create(input: CreateProjectInput): Promise<Project> {
    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: input.user_id,
        title: input.title,
        description: input.description ?? null,
        topic: input.topic ?? null,
        language: input.language ?? "en",
        video_format: input.video_format ?? "shorts",
        duration_target: input.duration_target ?? 30,
        template_id: input.template_id ?? null,
        tone: input.tone ?? "educational",
        status: "draft",
      })
      .select()
      .single();
    if (error) throw error;
    return data as Project;
  },

  async update(projectId: string, updates: Partial<Project>): Promise<Project> {
    const { data, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", projectId)
      .select()
      .single();
    if (error) throw error;
    return data as Project;
  },

  async remove(projectId: string): Promise<void> {
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) throw error;
  },

  async duplicate(project: Project): Promise<Project> {
    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: project.user_id,
        title: `${project.title} (Copy)`,
        description: project.description,
        topic: project.topic,
        raw_script: project.raw_script,
        final_script: project.final_script,
        tone: project.tone,
        language: project.language,
        video_format: project.video_format,
        aspect_ratio: project.aspect_ratio,
        duration_target: project.duration_target,
        template_id: project.template_id,
        status: "draft",
      })
      .select()
      .single();
    if (error) throw error;

    // Duplicate scenes too so the copy is immediately usable.
    const { data: scenes } = await supabase
      .from("scenes")
      .select("*")
      .eq("project_id", project.id)
      .order("scene_number");

    if (scenes && scenes.length > 0) {
      const newScenes = scenes.map((s: any) => ({
        project_id: data.id,
        scene_number: s.scene_number,
        voiceover_text: s.voiceover_text,
        subtitle_text: s.subtitle_text,
        visual_prompt: s.visual_prompt,
        broll_keyword: s.broll_keyword,
        duration_seconds: s.duration_seconds,
        transition_type: s.transition_type,
        background_music_mood: s.background_music_mood,
      }));
      await supabase.from("scenes").insert(newScenes);
    }

    return data as Project;
  },
};
