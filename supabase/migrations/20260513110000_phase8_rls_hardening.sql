-- Phase 8 production hardening for KPI/task/notification RLS.

CREATE OR REPLACE FUNCTION public.user_active_in_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.user_id = _user_id
      AND tm.team_id = _team_id
      AND tm.is_active = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = _team_id
      AND t.leader_id = _user_id
      AND t.status = 'active'
  );
$$;

DROP POLICY IF EXISTS "kpi_leader_manager_insert" ON public.kpi_targets;
CREATE POLICY "kpi_leader_manager_insert" ON public.kpi_targets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role('admin'::app_role)
    OR (
      team_id IS NOT NULL
      AND public.can_manage_team_kpi(team_id)
      AND (user_id IS NULL OR public.user_active_in_team(user_id, team_id))
    )
  );

DROP POLICY IF EXISTS "kpi_leader_manager_update" ON public.kpi_targets;
CREATE POLICY "kpi_leader_manager_update" ON public.kpi_targets
  FOR UPDATE TO authenticated
  USING (
    public.has_role('admin'::app_role)
    OR (team_id IS NOT NULL AND public.can_manage_team_kpi(team_id))
  )
  WITH CHECK (
    public.has_role('admin'::app_role)
    OR (
      team_id IS NOT NULL
      AND public.can_manage_team_kpi(team_id)
      AND (user_id IS NULL OR public.user_active_in_team(user_id, team_id))
    )
  );

DROP POLICY IF EXISTS "tasks_leader_manager_write" ON public.tasks;
CREATE POLICY "tasks_leader_manager_write" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    team_id IS NOT NULL
    AND public.can_manage_team_kpi(team_id)
    AND public.user_active_in_team(assigned_to, team_id)
  );

DROP POLICY IF EXISTS "tasks_leader_manager_update" ON public.tasks;
CREATE POLICY "tasks_leader_manager_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (team_id IS NOT NULL AND public.can_manage_team_kpi(team_id))
  WITH CHECK (
    team_id IS NOT NULL
    AND public.can_manage_team_kpi(team_id)
    AND public.user_active_in_team(assigned_to, team_id)
  );

DROP POLICY IF EXISTS "notifications_manager_insert" ON public.notifications;
CREATE POLICY "notifications_manager_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role('admin'::app_role)
    OR (
      public.is_manager()
      AND target_scope = 'all'
      AND team_id IS NULL
      AND user_id IS NULL
    )
    OR (
      public.is_manager()
      AND target_scope = 'team'
      AND team_id IS NOT NULL
      AND public.can_manage_team_kpi(team_id)
      AND user_id IS NULL
    )
  );
