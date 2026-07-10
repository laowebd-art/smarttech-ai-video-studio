-- ============================================================================
-- Phase 2: persist AI-generated captions/hashtags/hooks directly on the
-- project so they survive a page refresh without needing a render job first.
-- (exported_videos keeps its own per-platform caption columns for Phase 5,
-- used once a specific render is being published.)
-- ============================================================================

alter table public.projects
  add column if not exists generated_captions jsonb,      -- { youtube, tiktok, facebook, instagram }
  add column if not exists generated_hashtags text[],
  add column if not exists alternative_hooks text[],
  add column if not exists short_description text;
