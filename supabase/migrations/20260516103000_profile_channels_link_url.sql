ALTER TABLE public.profile_channels
  ADD COLUMN IF NOT EXISTS link_url text;

NOTIFY pgrst, 'reload schema';
