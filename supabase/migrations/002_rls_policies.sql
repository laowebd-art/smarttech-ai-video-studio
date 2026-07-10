-- ============================================================================
-- Row Level Security — every user can only access their own data.
-- Templates: system templates (owner_id null) are readable by everyone;
-- user-created templates are private to their owner.
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.templates enable row level security;
alter table public.projects enable row level security;
alter table public.scenes enable row level security;
alter table public.audio_assets enable row level security;
alter table public.visual_assets enable row level security;
alter table public.subtitle_assets enable row level security;
alter table public.render_jobs enable row level security;
alter table public.exported_videos enable row level security;
alter table public.ai_usage_logs enable row level security;

-- profiles: a user can read/update only their own profile row
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- templates: read system templates + your own; write/update/delete only your own
create policy "templates_select" on public.templates
  for select using (is_system = true or owner_id = auth.uid());
create policy "templates_insert_own" on public.templates
  for insert with check (owner_id = auth.uid());
create policy "templates_update_own" on public.templates
  for update using (owner_id = auth.uid());
create policy "templates_delete_own" on public.templates
  for delete using (owner_id = auth.uid());

-- projects: fully scoped to owner
create policy "projects_select_own" on public.projects
  for select using (user_id = auth.uid());
create policy "projects_insert_own" on public.projects
  for insert with check (user_id = auth.uid());
create policy "projects_update_own" on public.projects
  for update using (user_id = auth.uid());
create policy "projects_delete_own" on public.projects
  for delete using (user_id = auth.uid());

-- scenes: scoped via parent project ownership
create policy "scenes_select_own" on public.scenes
  for select using (
    exists (select 1 from public.projects p where p.id = scenes.project_id and p.user_id = auth.uid())
  );
create policy "scenes_insert_own" on public.scenes
  for insert with check (
    exists (select 1 from public.projects p where p.id = scenes.project_id and p.user_id = auth.uid())
  );
create policy "scenes_update_own" on public.scenes
  for update using (
    exists (select 1 from public.projects p where p.id = scenes.project_id and p.user_id = auth.uid())
  );
create policy "scenes_delete_own" on public.scenes
  for delete using (
    exists (select 1 from public.projects p where p.id = scenes.project_id and p.user_id = auth.uid())
  );

-- audio_assets / visual_assets / subtitle_assets / render_jobs / exported_videos:
-- same pattern — scoped via parent project ownership
create policy "audio_assets_all_own" on public.audio_assets
  for all using (
    exists (select 1 from public.projects p where p.id = audio_assets.project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = audio_assets.project_id and p.user_id = auth.uid())
  );

create policy "visual_assets_all_own" on public.visual_assets
  for all using (
    exists (select 1 from public.projects p where p.id = visual_assets.project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = visual_assets.project_id and p.user_id = auth.uid())
  );

create policy "subtitle_assets_all_own" on public.subtitle_assets
  for all using (
    exists (select 1 from public.projects p where p.id = subtitle_assets.project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = subtitle_assets.project_id and p.user_id = auth.uid())
  );

create policy "render_jobs_all_own" on public.render_jobs
  for all using (
    exists (select 1 from public.projects p where p.id = render_jobs.project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = render_jobs.project_id and p.user_id = auth.uid())
  );

create policy "exported_videos_all_own" on public.exported_videos
  for all using (
    exists (select 1 from public.projects p where p.id = exported_videos.project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = exported_videos.project_id and p.user_id = auth.uid())
  );

-- ai_usage_logs: user can read their own logs; inserts happen via server-side
-- (service_role) calls in Phase 2, so no insert policy is granted to anon/authenticated.
create policy "ai_usage_logs_select_own" on public.ai_usage_logs
  for select using (user_id = auth.uid());
