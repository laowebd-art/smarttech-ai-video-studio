-- ============================================================================
-- Phase 4: extend visual_assets to support solid/gradient backgrounds and
-- stock-photo attachments (in addition to uploaded files), and add an
-- updated_at trigger to both visual_assets and subtitle_assets.
-- ============================================================================

alter table public.visual_assets
  add column if not exists color_value text,        -- for source_type = 'solid'
  add column if not exists gradient_from text,       -- for source_type = 'gradient'
  add column if not exists gradient_to text,
  add column if not exists gradient_angle int default 135,
  add column if not exists updated_at timestamptz not null default now();

-- Stock photo results (Pexels/Pixabay/Unsplash) are a distinct case from
-- 'stock_video' — allow 'stock_image' too.
alter table public.visual_assets drop constraint if exists visual_assets_source_type_check;
alter table public.visual_assets add constraint visual_assets_source_type_check check (
  source_type in ('uploaded_image','uploaded_video','ai_image','stock_video','stock_image','solid','gradient','placeholder')
);

drop trigger if exists trg_visual_assets_updated_at on public.visual_assets;
create trigger trg_visual_assets_updated_at before update on public.visual_assets
  for each row execute function public.set_updated_at();

create index if not exists idx_visual_assets_scene_id on public.visual_assets(scene_id);

alter table public.subtitle_assets
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_subtitle_assets_updated_at on public.subtitle_assets;
create trigger trg_subtitle_assets_updated_at before update on public.subtitle_assets
  for each row execute function public.set_updated_at();

create index if not exists idx_subtitle_assets_scene_id on public.subtitle_assets(scene_id);
