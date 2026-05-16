-- Fix task assignment RLS to use public.profiles.id consistently and harden task/checklist notifications.

CREATE OR REPLACE FUNCTION public.user_active_member_of_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND _team_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.team_memberships tm
      WHERE tm.user_id = _user_id
        AND tm.team_id = _team_id
        AND tm.is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.profile_can_assign_task(
  _actor_id uuid,
  _team_id uuid,
  _assignee_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    _actor_id IS NOT NULL
    AND _team_id IS NOT NULL
    AND _assignee_id IS NOT NULL
    AND public.user_active_member_of_team(_assignee_id, _team_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.team_memberships leader_memberships
        JOIN public.user_roles leader_roles
          ON leader_roles.user_id = leader_memberships.user_id
         AND leader_roles.role = 'leader'::public.app_role
        WHERE leader_memberships.user_id = _actor_id
          AND leader_memberships.team_id = _team_id
          AND leader_memberships.is_active = true
      )
      OR EXISTS (
        SELECT 1
        FROM public.manager_team_assignments manager_assignments
        JOIN public.user_roles manager_roles
          ON manager_roles.user_id = manager_assignments.manager_id
         AND manager_roles.role = 'manager'::public.app_role
        WHERE manager_assignments.manager_id = _actor_id
          AND manager_assignments.team_id = _team_id
          AND manager_assignments.is_active = true
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_assign_task_to_team(_team_id uuid, _assignee uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.profile_can_assign_task(public.get_current_profile_id(), _team_id, _assignee);
$$;

DROP POLICY IF EXISTS "tasks_leader_manager_write" ON public.tasks;
CREATE POLICY "tasks_leader_manager_write" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    assigned_by = public.get_current_profile_id()
    AND public.profile_can_assign_task(assigned_by, team_id, assigned_to)
  );

DROP POLICY IF EXISTS "tasks_leader_manager_update" ON public.tasks;
CREATE POLICY "tasks_leader_manager_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    assigned_to = public.get_current_profile_id()
    OR public.profile_can_assign_task(public.get_current_profile_id(), team_id, assigned_to)
  )
  WITH CHECK (
    assigned_to = public.get_current_profile_id()
    OR public.profile_can_assign_task(public.get_current_profile_id(), team_id, assigned_to)
  );

DROP POLICY IF EXISTS "tasks_leader_manager_delete" ON public.tasks;
CREATE POLICY "tasks_leader_manager_delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (public.profile_can_assign_task(public.get_current_profile_id(), team_id, assigned_to));

CREATE OR REPLACE FUNCTION public.notify_team_leaders_for_task_completion(
  _team_id uuid,
  _actor_id uuid,
  _item_type text,
  _item_title text,
  _body text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name text;
BEGIN
  SELECT COALESCE(full_name, username, 'Nhân viên')
    INTO actor_name
  FROM public.profiles
  WHERE id = _actor_id;

  INSERT INTO public.notifications (
    title,
    body,
    kind,
    target_scope,
    user_id,
    team_id,
    created_by
  )
  SELECT DISTINCT
    actor_name || ' đã hoàn thành ' || _item_type || ' ' || COALESCE(_item_title, ''),
    _body,
    'task',
    'user',
    leader_memberships.user_id,
    NULL::uuid,
    _actor_id
  FROM public.team_memberships actor_memberships
  JOIN public.team_memberships leader_memberships
    ON leader_memberships.team_id = actor_memberships.team_id
   AND leader_memberships.is_active = true
  JOIN public.user_roles leader_roles
    ON leader_roles.user_id = leader_memberships.user_id
   AND leader_roles.role = 'leader'::public.app_role
  WHERE actor_memberships.user_id = _actor_id
    AND actor_memberships.is_active = true
    AND (_team_id IS NULL OR actor_memberships.team_id = _team_id)
    AND leader_memberships.user_id <> _actor_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (
    title,
    body,
    kind,
    target_scope,
    user_id,
    team_id,
    created_by
  )
  VALUES (
    'Bạn có task cần hoàn thành hôm nay',
    NEW.title,
    'task',
    'user',
    NEW.assigned_to,
    NULL::uuid,
    NEW.assigned_by
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_task_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'done'::public.task_status
     AND COALESCE(OLD.status::text, '') <> 'done' THEN
    PERFORM public.notify_team_leaders_for_task_completion(
      NEW.team_id,
      NEW.assigned_to,
      'task',
      NEW.title,
      NEW.completion_note
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_daily_task_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  template_team_id uuid;
  template_title text;
  should_notify boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_notify := NEW.completed = true;
  ELSIF TG_OP = 'UPDATE' THEN
    should_notify := NEW.completed = true AND COALESCE(OLD.completed, false) = false;
  END IF;

  IF should_notify THEN
    SELECT team_id, title
      INTO template_team_id, template_title
    FROM public.daily_task_templates
    WHERE id = NEW.template_id;

    PERFORM public.notify_team_leaders_for_task_completion(
      template_team_id,
      NEW.user_id,
      'checklist',
      template_title,
      COALESCE(NEW.completion_note, NEW.note)
    );
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_active_member_of_team(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_can_assign_task(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_assign_task_to_team(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
