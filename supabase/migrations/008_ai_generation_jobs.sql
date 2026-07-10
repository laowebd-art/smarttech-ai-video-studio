-- ============================================================================
-- ai_generation_jobs — tracks async, job-based AI generation (video
-- generation via Kling/Veo/Runway today; music/video-editing generation
-- later would follow the same shape). Distinct from render_jobs (Phase 5),
-- which composites an existing project's scenes into one MP4 — this table
-- is for raw provider-generated clips, standalone or attached to a project.
-- ============================================================================

create table if not exists public.ai_generation_jobs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  scene_id uuid references public.scenes(id) on delete set null,
  capability text not null default 'video_generation',
  mode text not null check (mode in ('text_to_video', 'image_to_video')),
  provider_name text,                       -- which adapter ended up handling it (set once submitted)
  external_job_id text,                     -- the provider's own task/operation id, for polling/cancel
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'completed', 'failed', 'cancelled')
  ),
  progress int not null default 0,
  input jsonb not null,                     -- { prompt, imageUrl?, durationSeconds?, aspectRatio? }
  result_url text,                          -- provider's own hosted URL (may expire — see storage_path)
  storage_path text,                        -- set once mirrored into our own Storage bucket
  error_message text,
  retry_count int not null default 0,
  max_retries int not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_ai_generation_jobs_user_id on public.ai_generation_jobs(user_id);
create index if not exists idx_ai_generation_jobs_project_id on public.ai_generation_jobs(project_id);
create index if not exists idx_ai_generation_jobs_status on public.ai_generation_jobs(status);

drop trigger if exists trg_ai_generation_jobs_updated_at on public.ai_generation_jobs;
create trigger trg_ai_generation_jobs_updated_at before update on public.ai_generation_jobs
  for each row execute function public.set_updated_at();

alter table public.ai_generation_jobs enable row level security;

create policy "ai_generation_jobs_select_own" on public.ai_generation_jobs
  for select using (user_id = auth.uid());
create policy "ai_generation_jobs_insert_own" on public.ai_generation_jobs
  for insert with check (user_id = auth.uid());
create policy "ai_generation_jobs_update_own" on public.ai_generation_jobs
  for update using (user_id = auth.uid());
create policy "ai_generation_jobs_delete_own" on public.ai_generation_jobs
  for delete using (user_id = auth.uid());

-- Private bucket for mirrored AI-generated video clips (distinct from
-- project-renders, which holds composited FFmpeg output).
insert into storage.buckets (id, name, public)
values ('ai-generated-videos', 'ai-generated-videos', false)
on conflict (id) do nothing;

create policy "ai_generated_videos_owner_rw" on storage.objects
  for all using (
    bucket_id = 'ai-generated-videos' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'ai-generated-videos' and (storage.foldername(name))[1] = auth.uid()::text
  );
