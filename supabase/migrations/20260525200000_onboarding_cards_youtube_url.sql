ALTER TABLE public.onboarding_cards
  ADD COLUMN IF NOT EXISTS youtube_url text;

COMMENT ON COLUMN public.onboarding_cards.youtube_url
  IS 'Optional YouTube URL used to embed a training video in the card detail modal.';

NOTIFY pgrst, 'reload schema';
