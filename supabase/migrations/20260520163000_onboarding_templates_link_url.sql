ALTER TABLE public.onboarding_task_templates
  ADD COLUMN IF NOT EXISTS link_url text;
