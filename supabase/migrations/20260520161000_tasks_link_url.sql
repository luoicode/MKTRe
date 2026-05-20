ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS link_url text;
