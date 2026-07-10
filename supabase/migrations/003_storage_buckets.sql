-- ============================================================================
-- Storage buckets. All buckets are private by default; access is via
-- signed URLs generated server-side (see src/services/storage helpers).
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('project-audio', 'project-audio', false),
  ('project-visuals', 'project-visuals', false),
  ('project-renders', 'project-renders', false),
  ('project-thumbnails', 'project-thumbnails', true),
  ('project-exports', 'project-exports', false)
on conflict (id) do nothing;

-- Users may only read/write objects inside a folder named after their own
-- user id, e.g. project-audio/<user_id>/<project_id>/<file>.mp3
create policy "audio_owner_rw" on storage.objects
  for all using (
    bucket_id = 'project-audio' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'project-audio' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "visuals_owner_rw" on storage.objects
  for all using (
    bucket_id = 'project-visuals' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'project-visuals' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "renders_owner_rw" on storage.objects
  for all using (
    bucket_id = 'project-renders' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'project-renders' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "exports_owner_rw" on storage.objects
  for all using (
    bucket_id = 'project-exports' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'project-exports' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- thumbnails bucket is public (read), write still restricted to owner folder
create policy "thumbnails_public_read" on storage.objects
  for select using (bucket_id = 'project-thumbnails');

create policy "thumbnails_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'project-thumbnails' and (storage.foldername(name))[1] = auth.uid()::text
  );
