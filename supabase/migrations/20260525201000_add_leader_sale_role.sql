ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'leader_sale';

NOTIFY pgrst, 'reload schema';
