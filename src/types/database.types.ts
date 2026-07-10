// Hand-written types matching supabase/migrations/001_initial_schema.sql.
// Once the project is linked to a real Supabase instance, regenerate with:
//   npx supabase gen types typescript --project-id <id> > src/types/database.types.ts

export type ProjectStatus =
  | "draft"
  | "script_ready"
  | "audio_ready"
  | "video_ready"
  | "rendered"
  | "failed";

export type VideoFormat = "shorts" | "tiktok" | "reels";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: "owner" | "admin" | "member";
  default_language: string;
  default_tts_provider: string;
  default_ai_model: string;
  default_duration_target: number;
  created_at: string;
  updated_at: string;
}

export interface Template {
  id: string;
  owner_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  default_tone: string;
  default_subtitle_style: string;
  default_scene_structure: unknown[];
  default_music_mood: string;
  default_duration: number;
  is_system: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  template_id: string | null;
  title: string;
  description: string | null;
  topic: string | null;
  raw_script: string | null;
  final_script: string | null;
  tone: string | null;
  language: string;
  video_format: VideoFormat;
  aspect_ratio: string;
  duration_target: number;
  status: ProjectStatus;
  generated_captions: {
    youtube?: string;
    tiktok?: string;
    facebook?: string;
    instagram?: string;
  } | null;
  generated_hashtags: string[] | null;
  alternative_hooks: string[] | null;
  short_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Scene {
  id: string;
  project_id: string;
  scene_number: number;
  voiceover_text: string | null;
  subtitle_text: string | null;
  visual_prompt: string | null;
  broll_keyword: string | null;
  duration_seconds: number;
  transition_type: "fade" | "cut" | "slide" | "zoom" | "none";
  background_music_mood: string;
  created_at: string;
  updated_at: string;
}

export interface AudioAsset {
  id: string;
  project_id: string;
  scene_id: string | null;
  provider: "openai" | "elevenlabs";
  voice_style: string | null;
  storage_path: string | null;
  public_url: string | null;
  duration_seconds: number | null;
  status: "queued" | "generating" | "ready" | "failed";
  created_at: string;
  updated_at: string;
}

export type VisualSourceType =
  | "uploaded_image"
  | "uploaded_video"
  | "ai_image"
  | "stock_video"
  | "stock_image"
  | "solid"
  | "gradient"
  | "placeholder";

export interface VisualAsset {
  id: string;
  project_id: string;
  scene_id: string | null;
  source_type: VisualSourceType;
  provider: string | null;
  search_keyword: string | null;
  storage_path: string | null;
  public_url: string | null;
  color_value: string | null;
  gradient_from: string | null;
  gradient_to: string | null;
  gradient_angle: number | null;
  created_at: string;
  updated_at: string;
}

export interface SubtitleTimingEntry {
  scene_id: string;
  scene_number: number;
  start: number;
  end: number;
  text: string;
}

export interface SubtitleAsset {
  id: string;
  project_id: string;
  scene_id: string | null;
  style: "clean" | "bold" | "yellow_highlight" | "white_shadow";
  position: "top" | "center" | "bottom";
  font_size: number;
  timing_json: SubtitleTimingEntry[];
  srt_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface RenderJob {
  id: string;
  project_id: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ExportedVideo {
  id: string;
  project_id: string;
  render_job_id: string | null;
  storage_path: string | null;
  public_url: string | null;
  width: number;
  height: number;
  fps: number;
  format: string;
  caption_youtube: string | null;
  caption_tiktok: string | null;
  caption_facebook: string | null;
  caption_instagram: string | null;
  hashtags: string[] | null;
  created_at: string;
}

// Minimal Database shape so `createClient<Database>()` type-checks.
// Extend the `Row`/`Insert`/`Update` triples per table as the app grows.
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      templates: { Row: Template; Insert: Partial<Template>; Update: Partial<Template> };
      projects: { Row: Project; Insert: Partial<Project>; Update: Partial<Project> };
      scenes: { Row: Scene; Insert: Partial<Scene>; Update: Partial<Scene> };
      render_jobs: { Row: RenderJob; Insert: Partial<RenderJob>; Update: Partial<RenderJob> };
      exported_videos: { Row: ExportedVideo; Insert: Partial<ExportedVideo>; Update: Partial<ExportedVideo> };
    };
  };
}
