-- ============================================================================
-- Seed: 8 system templates (owner_id = null, is_system = true)
-- Run after migrations. Safe to re-run (upsert on slug).
-- ============================================================================

insert into public.templates
  (name, slug, description, default_tone, default_subtitle_style, default_music_mood, default_duration, is_system, default_scene_structure)
values
  ('Motivational Quote', 'motivational-quote', 'Short punchy motivational message with bold captions.', 'motivational', 'bold', 'uplifting', 15, true,
    '[{"role":"hook"},{"role":"main"},{"role":"cta"}]'::jsonb),
  ('Emotional Story', 'emotional-story', 'Personal narrative arc designed to build an emotional connection.', 'emotional', 'clean', 'emotional', 45, true,
    '[{"role":"hook"},{"role":"setup"},{"role":"turning_point"},{"role":"resolution"},{"role":"cta"}]'::jsonb),
  ('Educational Explainer', 'educational-explainer', 'Clear step-by-step explanation of a concept.', 'educational', 'clean', 'neutral', 45, true,
    '[{"role":"hook"},{"role":"point_1"},{"role":"point_2"},{"role":"point_3"},{"role":"summary"}]'::jsonb),
  ('Product Advertisement', 'product-ad', 'Problem-agitate-solve structure for a product or service.', 'product ad', 'yellow_highlight', 'energetic', 30, true,
    '[{"role":"hook"},{"role":"problem"},{"role":"solution"},{"role":"proof"},{"role":"cta"}]'::jsonb),
  ('News Update', 'news-update', 'Fast factual delivery in a news-anchor style.', 'news', 'clean', 'neutral', 30, true,
    '[{"role":"headline"},{"role":"context"},{"role":"detail"},{"role":"closing"}]'::jsonb),
  ('AI Narration', 'ai-narration', 'Documentary-style narration over B-roll footage.', 'documentary', 'white_shadow', 'ambient', 60, true,
    '[{"role":"hook"},{"role":"narration_1"},{"role":"narration_2"},{"role":"narration_3"},{"role":"closing"}]'::jsonb),
  ('Before / After', 'before-after', 'Contrast structure highlighting transformation.', 'story', 'bold', 'uplifting', 30, true,
    '[{"role":"before"},{"role":"transition"},{"role":"after"},{"role":"cta"}]'::jsonb),
  ('Problem / Solution', 'problem-solution', 'Direct problem framing followed by a clear solution.', 'educational', 'clean', 'neutral', 30, true,
    '[{"role":"problem"},{"role":"consequence"},{"role":"solution"},{"role":"cta"}]'::jsonb)
on conflict (slug) do nothing;
