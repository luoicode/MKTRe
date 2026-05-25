ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sale';

NOTIFY pgrst, 'reload schema';
