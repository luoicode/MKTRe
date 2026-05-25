ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'marketing';

UPDATE public.teams
SET department = 'marketing'
WHERE department IS NULL;

ALTER TABLE public.teams
DROP CONSTRAINT IF EXISTS teams_department_check;

ALTER TABLE public.teams
ADD CONSTRAINT teams_department_check
CHECK (department IN ('marketing', 'sale'));

CREATE INDEX IF NOT EXISTS idx_teams_department_status
ON public.teams (department, status);

NOTIFY pgrst, 'reload schema';
