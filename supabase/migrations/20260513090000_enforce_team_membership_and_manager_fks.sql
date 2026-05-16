-- Enforce one active team membership per employee/leader at a time and
-- add relational integrity for manager-team assignments.

-- Close older duplicate active memberships before adding the partial unique index.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY start_date DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.team_memberships
  WHERE is_active = true
)
UPDATE public.team_memberships tm
SET
  is_active = false,
  end_date = COALESCE(tm.end_date, CURRENT_DATE),
  updated_at = now()
FROM ranked r
WHERE tm.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_team_memberships_one_active_team_per_user
  ON public.team_memberships(user_id)
  WHERE is_active = true;

ALTER TABLE public.manager_team_assignments
  ADD CONSTRAINT manager_team_assignments_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.manager_team_assignments
  ADD CONSTRAINT manager_team_assignments_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.manager_team_assignments
  ADD CONSTRAINT manager_team_assignments_assigned_by_fkey
  FOREIGN KEY (assigned_by) REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID;
