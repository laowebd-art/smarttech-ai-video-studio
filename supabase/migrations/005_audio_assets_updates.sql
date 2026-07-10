-- ============================================================================
-- Phase 3: small additions to audio_assets to support the Voice-over module.
-- (Table itself already exists from 001_initial_schema.sql.)
-- ============================================================================

-- Track which voice style was used, and when the row was last regenerated.
alter table public.audio_assets
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_audio_assets_updated_at on public.audio_assets;
create trigger trg_audio_assets_updated_at before update on public.audio_assets
  for each row execute function public.set_updated_at();

-- Helpful for "does this scene already have audio?" lookups.
create index if not exists idx_audio_assets_scene_id on public.audio_assets(scene_id);
