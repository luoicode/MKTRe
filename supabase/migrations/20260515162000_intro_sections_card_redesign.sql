ALTER TABLE public.intro_sections
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

UPDATE public.intro_sections
SET summary = COALESCE(summary, content)
WHERE summary IS NULL;

CREATE INDEX IF NOT EXISTS idx_intro_sections_active_sort
  ON public.intro_sections(is_active, sort_order, created_at);

NOTIFY pgrst, 'reload schema';
