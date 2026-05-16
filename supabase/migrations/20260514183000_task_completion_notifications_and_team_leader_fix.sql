-- Production hardening for task completion evidence, assigned_by cache mismatch,
-- employee reminder/completion notifications, and team leader source-of-truth sync.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_by uuid,
  ADD COLUMN IF NOT EXISTS proof_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tasks'::regclass
      AND conname = 'tasks_assigned_by_fkey'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_assigned_by_fkey
      FOREIGN KEY (assigned_by) REFERENCES public.profiles(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

ALTER TABLE public.task_completions
  ADD COLUMN IF NOT EXISTS completion_note text,
  ADD COLUMN IF NOT EXISTS proof_url text;

WITH active_leaders AS (
  SELECT DISTINCT ON (tm.team_id)
    tm.team_id,
    tm.user_id
  FROM public.team_memberships tm
  JOIN public.user_roles ur
    ON ur.user_id = tm.user_id
   AND ur.role = 'leader'::public.app_role
  WHERE tm.is_active = true
  ORDER BY tm.team_id, tm.start_date DESC, tm.created_at DESC
)
UPDATE public.teams t
SET leader_id = active_leaders.user_id
FROM active_leaders
WHERE t.id = active_leaders.team_id
  AND t.leader_id IS DISTINCT FROM active_leaders.user_id;

DROP POLICY IF EXISTS "notifications_same_team_user_insert" ON public.notifications;
CREATE POLICY "notifications_same_team_user_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    target_scope = 'user'
    AND user_id IS NOT NULL
    AND team_id IS NULL
    AND created_by = public.get_current_profile_id()
    AND EXISTS (
      SELECT 1
      FROM public.team_memberships mine
      JOIN public.team_memberships target
        ON target.team_id = mine.team_id
       AND target.user_id = notifications.user_id
       AND target.is_active = true
      WHERE mine.user_id = public.get_current_profile_id()
        AND mine.is_active = true
    )
  );

DROP POLICY IF EXISTS "task_completions_manager_select" ON public.task_completions;
CREATE POLICY "task_completions_manager_select" ON public.task_completions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.daily_task_templates dtt
      WHERE dtt.id = task_completions.template_id
        AND (
          dtt.team_id IS NULL
          OR public.can_view_team(dtt.team_id)
        )
    )
  );

NOTIFY pgrst, 'reload schema';
