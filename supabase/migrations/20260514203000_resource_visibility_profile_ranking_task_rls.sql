-- Final production hardening for resource visibility, profile fields, ranking directory,
-- and task insert policies using profile ids consistently.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS phone text;

DROP POLICY IF EXISTS profiles_self_update_basic ON public.profiles;
CREATE POLICY profiles_self_update_basic ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = public.get_current_profile_id())
  WITH CHECK (id = public.get_current_profile_id());

CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.id = public.get_current_profile_id()
     AND NOT public.has_role('admin'::app_role) THEN
    NEW.auth_user_id := OLD.auth_user_id;
    NEW.email := OLD.email;
    NEW.full_name := OLD.full_name;
    NEW.username := OLD.username;
    NEW.status := OLD.status;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_profiles_self_update_guard ON public.profiles;
CREATE TRIGGER tr_profiles_self_update_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();

DROP POLICY IF EXISTS "resource_items_select" ON public.resource_items;
CREATE POLICY "resource_items_select" ON public.resource_items
  FOR SELECT TO authenticated
  USING (
    public.has_role('admin'::app_role)
    OR created_by = public.get_current_profile_id()
    OR (
      target_team_id IS NULL
      AND target_user_id IS NULL
      AND team_id IS NULL
    )
    OR (
      is_provided = true
      AND (
        target_user_id = public.get_current_profile_id()
        OR (target_team_id IS NOT NULL AND public.can_view_team(target_team_id))
        OR (team_id IS NOT NULL AND public.can_view_team(team_id))
      )
    )
  );

DROP POLICY IF EXISTS "resource_links_select" ON public.resource_links;
CREATE POLICY "resource_links_select" ON public.resource_links
  FOR SELECT TO authenticated
  USING (
    public.has_role('admin'::app_role)
    OR created_by = public.get_current_profile_id()
    OR (
      is_provided = true
      AND team_id IS NOT NULL
      AND public.can_view_team(team_id)
    )
  );

CREATE OR REPLACE FUNCTION public.can_assign_task_to_team(_team_id uuid, _assignee uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    _team_id IS NOT NULL
    AND public.user_active_member_of_team(_assignee, _team_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.team_memberships tm
        JOIN public.user_roles ur
          ON ur.user_id = tm.user_id
         AND ur.role = 'leader'::app_role
        WHERE tm.user_id = public.get_current_profile_id()
          AND tm.team_id = _team_id
          AND tm.is_active = true
      )
      OR EXISTS (
        SELECT 1
        FROM public.manager_team_assignments mta
        WHERE mta.manager_id = public.get_current_profile_id()
          AND mta.team_id = _team_id
          AND mta.is_active = true
      )
    );
$$;

DROP POLICY IF EXISTS "tasks_leader_manager_write" ON public.tasks;
CREATE POLICY "tasks_leader_manager_write" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    assigned_by = public.get_current_profile_id()
    AND public.can_assign_task_to_team(team_id, assigned_to)
  );

DROP POLICY IF EXISTS "tasks_leader_manager_update" ON public.tasks;
CREATE POLICY "tasks_leader_manager_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.can_assign_task_to_team(team_id, assigned_to))
  WITH CHECK (public.can_assign_task_to_team(team_id, assigned_to));

DROP POLICY IF EXISTS "tasks_leader_manager_delete" ON public.tasks;
CREATE POLICY "tasks_leader_manager_delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (public.can_assign_task_to_team(team_id, assigned_to));

CREATE OR REPLACE FUNCTION public.get_visible_profile_directory()
RETURNS TABLE (
  id uuid,
  full_name text,
  username text,
  avatar_url text,
  role app_role,
  team_id uuid,
  team_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH visible_teams AS (
    SELECT t.id
    FROM public.teams t
    WHERE public.has_role('admin'::app_role)
       OR public.manager_leads_team(t.id)
       OR public.leads_team(t.id)
       OR EXISTS (
         SELECT 1
         FROM public.team_memberships self_tm
         WHERE self_tm.team_id = t.id
           AND self_tm.user_id = public.get_current_profile_id()
           AND self_tm.is_active = true
       )
  )
  SELECT
    p.id,
    p.full_name,
    p.username,
    p.avatar_url,
    ur.role,
    tm.team_id,
    t.name AS team_name
  FROM public.team_memberships tm
  JOIN visible_teams vt ON vt.id = tm.team_id
  JOIN public.teams t ON t.id = tm.team_id
  JOIN public.profiles p ON p.id = tm.user_id
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE tm.is_active = true
    AND p.status = 'active'::user_status;
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_profile_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_assign_task_to_team(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
