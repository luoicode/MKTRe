-- Refactor notifications to target-based, role/ownership-aware delivery.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info';

UPDATE public.notifications
SET
  target_profile_id = COALESCE(target_profile_id, user_id),
  actor_profile_id = COALESCE(actor_profile_id, created_by),
  type = COALESCE(type, kind, 'system'),
  scope = COALESCE(scope, NULLIF(target_scope, ''), 'personal'),
  message = COALESCE(message, body)
WHERE target_profile_id IS NULL
   OR actor_profile_id IS NULL
   OR type IS NULL
   OR scope IS NULL
   OR message IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_target_created
  ON public.notifications(target_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_target_unread
  ON public.notifications(target_profile_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_entity
  ON public.notifications(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_notifications_actor_created
  ON public.notifications(actor_profile_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.emit_notification(
  _target_profile_id uuid,
  _actor_profile_id uuid,
  _type text,
  _scope text,
  _entity_type text,
  _entity_id uuid,
  _title text,
  _message text DEFAULT NULL,
  _severity text DEFAULT 'info',
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF _target_profile_id IS NULL THEN
    RAISE EXCEPTION 'Notification target is required.';
  END IF;

  IF NULLIF(trim(COALESCE(_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Notification title is required.';
  END IF;

  INSERT INTO public.notifications (
    target_profile_id,
    actor_profile_id,
    type,
    scope,
    entity_type,
    entity_id,
    title,
    message,
    is_read,
    severity,
    metadata,
    user_id,
    created_by,
    kind,
    target_scope,
    team_id,
    body
  )
  VALUES (
    _target_profile_id,
    _actor_profile_id,
    COALESCE(NULLIF(_type, ''), 'system'),
    COALESCE(NULLIF(_scope, ''), 'personal'),
    NULLIF(_entity_type, ''),
    _entity_id,
    trim(_title),
    NULLIF(_message, ''),
    false,
    COALESCE(NULLIF(_severity, ''), 'info'),
    COALESCE(_metadata, '{}'::jsonb),
    _target_profile_id,
    _actor_profile_id,
    COALESCE(NULLIF(_type, ''), 'system'),
    COALESCE(NULLIF(_scope, ''), 'personal'),
    CASE
      WHEN (_metadata ? 'team_id') THEN NULLIF(_metadata->>'team_id', '')::uuid
      ELSE NULL
    END,
    NULLIF(_message, '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.emit_notification(
  uuid, uuid, text, text, text, uuid, text, text, text, jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_insert_target_notification(
  _target_profile_id uuid,
  _actor_profile_id uuid,
  _scope text,
  _team_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _target_profile_id IS NOT NULL
    AND _actor_profile_id = public.get_current_profile_id()
    AND (
      (
        _scope = 'system'
        AND public.has_role('admin'::public.app_role)
        AND EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = _target_profile_id
            AND ur.role = 'admin'::public.app_role
        )
      )
      OR (
        _scope = 'personal'
        AND (
          _target_profile_id = public.get_current_profile_id()
          OR public.has_role('admin'::public.app_role)
          OR public.manager_leads_user(_target_profile_id)
          OR public.user_in_my_team(_target_profile_id)
        )
      )
      OR (
        _scope = 'team'
        AND _team_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.team_memberships tm
          WHERE tm.user_id = _target_profile_id
            AND tm.team_id = _team_id
            AND tm.is_active = true
        )
        AND (
          public.has_role('admin'::public.app_role)
          OR public.manager_leads_team(_team_id)
          OR public.leads_team(_team_id)
        )
      )
    );
$$;

DROP POLICY IF EXISTS "notifications_select_targeted" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
DROP POLICY IF EXISTS "notifications_manager_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_same_team_user_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_scoped_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_target_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_target_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_target_insert" ON public.notifications;

CREATE POLICY "notifications_target_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (target_profile_id = public.get_current_profile_id());

CREATE POLICY "notifications_target_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (target_profile_id = public.get_current_profile_id())
  WITH CHECK (target_profile_id = public.get_current_profile_id());

CREATE POLICY "notifications_target_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_insert_target_notification(
      target_profile_id,
      actor_profile_id,
      scope,
      team_id
    )
  );

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

  PERFORM public.emit_notification(
    leader_memberships.user_id,
    _actor_id,
    'task_review',
    'team',
    _item_type,
    NULL,
    actor_name || ' đã gửi duyệt ' || _item_type,
    COALESCE(_body, _item_title),
    'info',
    jsonb_build_object('team_id', actor_memberships.team_id)
  )
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
    PERFORM public.emit_notification(
      NEW.assigned_to,
      NEW.assigned_by,
      'task_assigned',
      'personal',
      'task',
      NEW.id,
      'Bạn có task mới',
      NEW.title,
      'info',
      jsonb_build_object('team_id', NEW.team_id)
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
DECLARE
  assignee_name text;
BEGIN
  SELECT COALESCE(full_name, username, 'Nhân viên')
    INTO assignee_name
  FROM public.profiles
  WHERE id = NEW.assigned_to;

  IF NEW.status::text = 'pending_review'
     AND COALESCE(OLD.status::text, '') <> 'pending_review' THEN
    PERFORM public.emit_notification(
      recipients.user_id,
      NEW.assigned_to,
      'task_review',
      'team',
      'task',
      NEW.id,
      assignee_name || ' đã gửi duyệt task',
      NEW.title,
      'info',
      jsonb_build_object('team_id', NEW.team_id)
    )
    FROM (
      SELECT tm.user_id
      FROM public.team_memberships tm
      JOIN public.user_roles ur ON ur.user_id = tm.user_id AND ur.role = 'leader'::public.app_role
      WHERE tm.team_id = NEW.team_id
        AND tm.is_active = true
        AND tm.user_id <> NEW.assigned_to
      UNION
      SELECT mta.manager_id AS user_id
      FROM public.manager_team_assignments mta
      WHERE mta.team_id = NEW.team_id
        AND mta.is_active = true
    ) recipients;
  END IF;

  IF NEW.status::text = 'done'
     AND COALESCE(OLD.status::text, '') <> 'done' THEN
    PERFORM public.emit_notification(
      NEW.assigned_to,
      COALESCE(NEW.reviewed_by, public.get_current_profile_id()),
      'task_approved',
      'personal',
      'task',
      NEW.id,
      'Task đã được duyệt hoàn thành',
      NEW.title,
      'success',
      jsonb_build_object('team_id', NEW.team_id)
    );
  END IF;

  IF NEW.status::text IN ('todo', 'in_progress')
     AND COALESCE(OLD.status::text, '') = 'pending_review' THEN
    PERFORM public.emit_notification(
      NEW.assigned_to,
      COALESCE(NEW.reviewed_by, public.get_current_profile_id()),
      'task_rejected',
      'personal',
      'task',
      NEW.id,
      'Task cần làm lại',
      COALESCE(NULLIF(NEW.review_feedback, ''), NEW.title),
      'error',
      jsonb_build_object('team_id', NEW.team_id)
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
  actor_name text;
  previous_status text := '';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    previous_status := COALESCE(OLD.status, '');
  END IF;

  SELECT team_id, title
    INTO template_team_id, template_title
  FROM public.daily_task_templates
  WHERE id = NEW.template_id;

  SELECT COALESCE(full_name, username, 'Nhân viên')
    INTO actor_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF COALESCE(NEW.status, '') = 'pending_review'
     AND previous_status <> 'pending_review' THEN
    PERFORM public.emit_notification(
      recipients.user_id,
      NEW.user_id,
      'task_review',
      'team',
      'task_completion',
      NEW.id,
      actor_name || ' đã gửi duyệt checklist',
      template_title,
      'info',
      jsonb_build_object('team_id', template_team_id)
    )
    FROM (
      SELECT tm.user_id
      FROM public.team_memberships tm
      JOIN public.user_roles ur ON ur.user_id = tm.user_id AND ur.role = 'leader'::public.app_role
      WHERE tm.team_id = template_team_id
        AND tm.is_active = true
        AND tm.user_id <> NEW.user_id
      UNION
      SELECT mta.manager_id AS user_id
      FROM public.manager_team_assignments mta
      WHERE mta.team_id = template_team_id
        AND mta.is_active = true
    ) recipients;
  END IF;

  IF COALESCE(NEW.status, '') = 'done'
     AND previous_status <> 'done' THEN
    PERFORM public.emit_notification(
      NEW.user_id,
      COALESCE(NEW.reviewed_by, public.get_current_profile_id()),
      'task_approved',
      'personal',
      'task_completion',
      NEW.id,
      'Checklist đã được duyệt hoàn thành',
      template_title,
      'success',
      jsonb_build_object('team_id', template_team_id)
    );
  END IF;

  IF COALESCE(NEW.status, '') IN ('todo', 'in_progress')
     AND previous_status = 'pending_review' THEN
    PERFORM public.emit_notification(
      NEW.user_id,
      COALESCE(NEW.reviewed_by, public.get_current_profile_id()),
      'task_rejected',
      'personal',
      'task_completion',
      NEW.id,
      'Checklist cần làm lại',
      COALESCE(NULLIF(NEW.review_feedback, ''), template_title),
      'error',
      jsonb_build_object('team_id', template_team_id)
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

NOTIFY pgrst, 'reload schema';
