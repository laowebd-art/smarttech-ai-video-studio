-- ============================================================================
-- Seed: AI Router provider catalog + capability routing priority.
-- Safe to re-run (upsert on natural keys).
--
-- "Live today" rows (openai, anthropic, elevenlabs, kling, google-veo,
-- runway) are actually callable — see server/lib/adapters/registerAdapters.ts.
-- Everything else is a real row so the routing table matches the platform's
-- intended shape end to end, but is registered as a "coming soon" stub
-- adapter that returns a clear not-implemented error if ever reached (see
-- server/lib/adapters/comingSoon.ts).
-- ============================================================================

insert into public.ai_providers (slug, display_name, category, status, website_url) values
  ('openai',          'OpenAI (ChatGPT)',   'text_generation',  'active',  'https://openai.com'),
  ('anthropic',       'Anthropic (Claude)', 'text_generation',  'active',  'https://anthropic.com'),
  ('elevenlabs',      'ElevenLabs',         'voice_generation', 'active',  'https://elevenlabs.io'),
  ('kling',           'Kling',              'video_generation', 'active',  'https://klingai.com'),
  ('google-veo',      'Google Veo',         'video_generation', 'active',  'https://deepmind.google/technologies/veo'),
  ('runway',          'Runway',             'video_generation', 'active',  'https://runwayml.com'),
  ('openai-images',   'ChatGPT Images',     'image_generation', 'planned', 'https://openai.com'),
  ('flux',            'Flux',               'image_generation', 'planned', 'https://blackforestlabs.ai'),
  ('suno',            'Suno',               'music_generation', 'planned', 'https://suno.com'),
  ('capcut',          'CapCut workflow',    'video_editing',    'planned', 'https://capcut.com'),
  ('davinci-resolve', 'DaVinci Resolve workflow', 'video_editing', 'planned', 'https://blackmagicdesign.com/products/davinciresolve'),
  ('youtube',         'YouTube',            'publishing',       'planned', 'https://youtube.com'),
  ('tiktok',          'TikTok',             'publishing',       'planned', 'https://tiktok.com'),
  ('facebook',        'Facebook',           'publishing',       'planned', 'https://facebook.com')
on conflict (slug) do update set status = excluded.status;

insert into public.provider_configs (capability, provider_name, priority, enabled, notes) values
  ('text_generation', 'openai',          10, true,  'Primary — ChatGPT for content writing'),
  ('text_generation', 'anthropic',       20, true,  'Fallback if OpenAI fails or is unconfigured'),
  ('translation',     'openai',          10, true,  'ChatGPT handles translation'),
  ('translation',     'anthropic',       20, true,  'Fallback'),
  ('voice_generation','elevenlabs',      10, true,  'Primary per routing spec'),
  ('voice_generation','openai',          20, true,  'Fallback TTS'),
  ('video_generation','kling',           10, true,  'Primary per routing spec'),
  ('video_generation','google-veo',      20, true,  'Fallback if Kling fails or is unconfigured'),
  ('video_generation','runway',          30, true,  'Second fallback'),
  ('image_generation','openai-images',   10, false, 'Adapter not implemented yet'),
  ('image_generation','flux',            20, false, 'Adapter not implemented yet'),
  ('music_generation','suno',            10, false, 'Adapter not implemented yet'),
  ('video_editing',   'capcut',          10, false, 'Adapter not implemented yet'),
  ('video_editing',   'davinci-resolve', 20, false, 'Adapter not implemented yet'),
  ('publishing',      'youtube',         10, false, 'Adapter not implemented yet'),
  ('publishing',      'tiktok',          20, false, 'Adapter not implemented yet'),
  ('publishing',      'facebook',        30, false, 'Adapter not implemented yet')
on conflict (capability, provider_name) do update set priority = excluded.priority, enabled = excluded.enabled, notes = excluded.notes;
