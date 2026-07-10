-- ============================================================================
-- SmartTech AI Video Studio — Initial Schema
-- Phase 1: core tables. Later-phase tables are included now so the schema
-- does not need breaking changes as Phases 2-5 are implemented.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users). Single-owner today, multi-user ready.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  default_language text not null default 'en',
  default_tts_provider text not null default 'openai',
  default_ai_model text not null default 'gpt-4o',
  default_duration_target int not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- templates (seeded with 8 defaults, see seed/templates.sql)
-- ---------------------------------------------------------------------------
create table if not exists public.templates (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid references public.profiles(id) on delete cascade, -- null = system template
  name text not null,
  slug text not null unique,
  description text,
  default_tone text not null,
  default_subtitle_style text not null default 'bold',
  default_scene_structure jsonb not null default '[]'::jsonb,
  default_music_mood text not null default 'neutral',
  default_duration int not null default 30,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  template_id uuid references public.templates(id) on delete set null,
  title text not null default 'Untitled Video',
  description text,
  topic text,
  raw_script text,
  final_script text,
  tone text default 'educational',
  language text not null default 'en',
  video_format text not null default 'shorts' check (video_format in ('shorts','tiktok','reels')),
  aspect_ratio text not null default '9:16',
  duration_target int not null default 30,
  status text not null default 'draft' check (
    status in ('draft','script_ready','audio_ready','video_ready','rendered','failed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_projects_status on public.projects(status);

-- ---------------------------------------------------------------------------
-- scenes
-- ---------------------------------------------------------------------------
create table if not exists public.scenes (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_number int not null,
  voiceover_text text,
  subtitle_text text,
  visual_prompt text,
  broll_keyword text,
  duration_seconds numeric(5,2) default 5,
  transition_type text default 'fade' check (transition_type in ('fade','cut','slide','zoom','none')),
  background_music_mood text default 'neutral',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, scene_number)
);

create index if not exists idx_scenes_project_id on public.scenes(project_id);

-- ---------------------------------------------------------------------------
-- audio_assets (Phase 3)
-- ---------------------------------------------------------------------------
create table if not exists public.audio_assets (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete cascade,
  provider text not null default 'openai' check (provider in ('openai','elevenlabs')),
  voice_style text default 'calm',
  storage_path text,
  public_url text,
  duration_seconds numeric(6,2),
  status text not null default 'queued' check (status in ('queued','generating','ready','failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_audio_assets_project_id on public.audio_assets(project_id);

-- ---------------------------------------------------------------------------
-- visual_assets (Phase 4)
-- ---------------------------------------------------------------------------
create table if not exists public.visual_assets (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete cascade,
  source_type text not null default 'placeholder' check (
    source_type in ('uploaded_image','uploaded_video','ai_image','stock_video','solid','gradient','placeholder')
  ),
  provider text,
  search_keyword text,
  storage_path text,
  public_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_visual_assets_project_id on public.visual_assets(project_id);

-- ---------------------------------------------------------------------------
-- subtitle_assets (Phase 4)
-- ---------------------------------------------------------------------------
create table if not exists public.subtitle_assets (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete cascade,
  style text default 'bold' check (style in ('clean','bold','yellow_highlight','white_shadow')),
  position text default 'bottom' check (position in ('top','center','bottom')),
  font_size int default 42,
  timing_json jsonb default '[]'::jsonb,
  srt_text text,
  created_at timestamptz not null default now()
);

create index if not exists idx_subtitle_assets_project_id on public.subtitle_assets(project_id);

-- ---------------------------------------------------------------------------
-- render_jobs (Phase 5)
-- ---------------------------------------------------------------------------
create table if not exists public.render_jobs (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','rendering','completed','failed')),
  progress int not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_render_jobs_project_id on public.render_jobs(project_id);

-- ---------------------------------------------------------------------------
-- exported_videos (Phase 5)
-- ---------------------------------------------------------------------------
create table if not exists public.exported_videos (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  render_job_id uuid references public.render_jobs(id) on delete set null,
  storage_path text,
  public_url text,
  width int default 1080,
  height int default 1920,
  fps int default 30,
  format text default 'mp4',
  caption_youtube text,
  caption_tiktok text,
  caption_facebook text,
  caption_instagram text,
  hashtags text[],
  created_at timestamptz not null default now()
);

create index if not exists idx_exported_videos_project_id on public.exported_videos(project_id);

-- ---------------------------------------------------------------------------
-- ai_usage_logs
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  feature text not null,
  provider text,
  tokens_used int,
  cost_estimate_usd numeric(10,4),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_logs_user_id on public.ai_usage_logs(user_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists trg_scenes_updated_at on public.scenes;
create trigger trg_scenes_updated_at before update on public.scenes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- auto-create profile row on new auth user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
