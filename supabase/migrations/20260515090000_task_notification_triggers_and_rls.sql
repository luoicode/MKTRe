-- Make task notifications transactional and tighten notification insert scope.

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
    NULL,
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
  IF NEW.assigned_to IS NOT NULL THEN
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
      NULL,
      NEW.assigned_by
    );
  END IF;

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
BEGIN
  IF NEW.completed = true
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.completed, false) = false) THEN
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

DROP TRIGGER IF EXISTS tr_notify_task_assigned ON public.tasks;
CREATE TRIGGER tr_notify_task_assigned
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_assigned();

DROP TRIGGER IF EXISTS tr_notify_task_completed ON public.tasks;
CREATE TRIGGER tr_notify_task_completed
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_task_completed();

DROP TRIGGER IF EXISTS tr_notify_daily_task_completed ON public.task_completions;
CREATE TRIGGER tr_notify_daily_task_completed
  AFTER INSERT OR UPDATE ON public.task_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_daily_task_completed();

DROP POLICY IF EXISTS "notifications_same_team_user_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_manager_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_scoped_insert" ON public.notifications;

CREATE POLICY "notifications_scoped_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.get_current_profile_id()
    AND (
      public.has_role('admin'::public.app_role)
      OR (
        public.is_manager()
        AND (
          (
            target_scope = 'all'
            AND team_id IS NULL
            AND user_id IS NULL
          )
          OR (
            target_scope = 'team'
            AND team_id IS NOT NULL
            AND user_id IS NULL
            AND public.manager_leads_team(team_id)
          )
          OR (
            target_scope = 'user'
            AND user_id IS NOT NULL
            AND team_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.team_memberships target_memberships
              JOIN public.manager_team_assignments assignments
                ON assignments.team_id = target_memberships.team_id
               AND assignments.is_active = true
              WHERE target_memberships.user_id = notifications.user_id
                AND target_memberships.is_active = true
                AND assignments.manager_id = public.get_current_profile_id()
            )
          )
        )
      )
      OR (
        public.has_role('leader'::public.app_role)
        AND (
          (
            target_scope = 'team'
            AND team_id IS NOT NULL
            AND user_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.team_memberships leader_memberships
              WHERE leader_memberships.user_id = public.get_current_profile_id()
                AND leader_memberships.team_id = notifications.team_id
                AND leader_memberships.is_active = true
            )
          )
          OR (
            target_scope = 'user'
            AND user_id IS NOT NULL
            AND team_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.team_memberships leader_memberships
              JOIN public.team_memberships target_memberships
                ON target_memberships.team_id = leader_memberships.team_id
               AND target_memberships.user_id = notifications.user_id
               AND target_memberships.is_active = true
              WHERE leader_memberships.user_id = public.get_current_profile_id()
                AND leader_memberships.is_active = true
            )
          )
        )
      )
    )
  );

NOTIFY pgrst, 'reload schema';
