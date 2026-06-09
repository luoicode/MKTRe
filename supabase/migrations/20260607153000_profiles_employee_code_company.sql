ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_code text,
  ADD COLUMN IF NOT EXISTS company_name text;

