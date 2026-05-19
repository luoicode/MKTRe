CREATE TABLE IF NOT EXISTS public.telegram_callback_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id text,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  status text NOT NULL CHECK (status IN ('success', 'failed', 'denied', 'duplicate')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_callback_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_callback_logs_admin_manager_select" ON public.telegram_callback_logs;
CREATE POLICY "telegram_callback_logs_admin_manager_select" ON public.telegram_callback_logs
  FOR SELECT TO authenticated
  USING (public.has_role('admin'::public.app_role) OR public.is_manager());

CREATE OR REPLACE FUNCTION public.can_review_user_as_actor(
  _reviewer_profile_id uuid,
  _target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _reviewer_profile_id IS NOT NULL
    AND _target_user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.user_roles reviewer_role
        WHERE reviewer_role.user_id = _reviewer_profile_id
          AND reviewer_role.role IN ('admin'::public.app_role, 'manager'::public.app_role)
      )
      OR (
        _reviewer_profile_id <> _target_user_id
        AND EXISTS (
          SELECT 1
          FROM public.user_roles reviewer_role
          WHERE reviewer_role.user_id = _reviewer_profile_id
            AND reviewer_role.role = 'leader'::public.app_role
        )
        AND EXISTS (
          SELECT 1
          FROM public.user_roles target_role
          WHERE target_role.user_id = _target_user_id
            AND target_role.role = 'employee'::public.app_role
        )
        AND EXISTS (
          SELECT 1
          FROM public.team_memberships reviewer_membership
          JOIN public.team_memberships target_membership
            ON target_membership.team_id = reviewer_membership.team_id
           AND target_membership.is_active = true
          WHERE reviewer_membership.user_id = _reviewer_profile_id
            AND reviewer_membership.is_active = true
            AND target_membership.user_id = _target_user_id
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.guard_task_review_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status text := COALESCE(OLD.status::text, '');
  new_status text := COALESCE(NEW.status::text, '');
  is_review_change boolean;
BEGIN
  is_review_change :=
    (old_status = 'pending_review' AND new_status IN ('done', 'in_progress', 'todo'))
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.review_feedback IS DISTINCT FROM OLD.review_feedback;

  IF is_review_change
    AND NOT (
      public.can_review_user_as_current_actor(OLD.assigned_to)
      OR public.can_review_user_as_actor(NEW.reviewed_by, OLD.assigned_to)
    )
  THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt mục này';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_task_completion_review_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status text := COALESCE(OLD.status, '');
  new_status text := COALESCE(NEW.status, '');
  is_review_change boolean;
BEGIN
  is_review_change :=
    (old_status = 'pending_review' AND new_status IN ('done', 'in_progress', 'todo'))
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.review_feedback IS DISTINCT FROM OLD.review_feedback;

  IF is_review_change
    AND NOT (
      public.can_review_user_as_current_actor(OLD.user_id)
      OR public.can_review_user_as_actor(NEW.reviewed_by, OLD.user_id)
    )
  THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt mục này';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.telegram_review_task(
  _reviewer_profile_id uuid,
  _entity_type text,
  _entity_id uuid,
  _approved boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_target_user_id uuid;
  v_title text;
  v_status text;
BEGIN
  IF _reviewer_profile_id IS NULL OR _entity_id IS NULL THEN
    RETURN jsonb_build_object('status', 'failed', 'message', 'Thiếu dữ liệu duyệt.');
  END IF;

  IF _entity_type = 'task' THEN
    SELECT assigned_to, title, status::text
    INTO v_target_user_id, v_title, v_status
    FROM public.tasks
    WHERE id = _entity_id;

    IF v_target_user_id IS NULL THEN
      RETURN jsonb_build_object('status', 'failed', 'message', 'Không tìm thấy task.');
    END IF;

    IF v_status <> 'pending_review' THEN
      RETURN jsonb_build_object(
        'status', 'duplicate',
        'message', 'Mục này đã được xử lý trước đó.',
        'target_profile_id', v_target_user_id,
        'title', v_title
      );
    END IF;

    IF NOT public.can_review_user_as_actor(_reviewer_profile_id, v_target_user_id) THEN
      RETURN jsonb_build_object('status', 'denied', 'message', 'Bạn không có quyền duyệt mục này.');
    END IF;

    UPDATE public.tasks
    SET status = CASE WHEN _approved THEN 'done'::public.task_status ELSE 'in_progress'::public.task_status END,
        completed_at = CASE WHEN _approved THEN v_now ELSE NULL END,
        reviewed_by = _reviewer_profile_id,
        reviewed_at = v_now,
        review_feedback = CASE WHEN _approved THEN NULL ELSE 'Không duyệt từ Telegram' END
    WHERE id = _entity_id;

    RETURN jsonb_build_object(
      'status', 'success',
      'message', CASE WHEN _approved THEN 'Đã duyệt task.' ELSE 'Đã không duyệt task.' END,
      'target_profile_id', v_target_user_id,
      'title', v_title
    );
  END IF;

  IF _entity_type = 'task_completion' THEN
    SELECT completion.user_id, template.title, completion.status
    INTO v_target_user_id, v_title, v_status
    FROM public.task_completions completion
    LEFT JOIN public.daily_task_templates template ON template.id = completion.template_id
    WHERE completion.id = _entity_id;

    IF v_target_user_id IS NULL THEN
      RETURN jsonb_build_object('status', 'failed', 'message', 'Không tìm thấy checklist.');
    END IF;

    IF v_status <> 'pending_review' THEN
      RETURN jsonb_build_object(
        'status', 'duplicate',
        'message', 'Mục này đã được xử lý trước đó.',
        'target_profile_id', v_target_user_id,
        'title', v_title
      );
    END IF;

    IF NOT public.can_review_user_as_actor(_reviewer_profile_id, v_target_user_id) THEN
      RETURN jsonb_build_object('status', 'denied', 'message', 'Bạn không có quyền duyệt mục này.');
    END IF;

    UPDATE public.task_completions
    SET status = CASE WHEN _approved THEN 'done' ELSE 'in_progress' END,
        completed = _approved,
        completed_at = CASE WHEN _approved THEN v_now ELSE NULL END,
        reviewed_by = _reviewer_profile_id,
        reviewed_at = v_now,
        review_feedback = CASE WHEN _approved THEN NULL ELSE 'Không duyệt từ Telegram' END
    WHERE id = _entity_id;

    RETURN jsonb_build_object(
      'status', 'success',
      'message', CASE WHEN _approved THEN 'Đã duyệt checklist.' ELSE 'Đã không duyệt checklist.' END,
      'target_profile_id', v_target_user_id,
      'title', COALESCE(v_title, 'Checklist')
    );
  END IF;

  RETURN jsonb_build_object('status', 'failed', 'message', 'Loại mục không hợp lệ.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.telegram_review_task(uuid, text, uuid, boolean) TO authenticated;

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
      SELECT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::public.app_role, 'manager'::public.app_role)
        AND ur.user_id <> NEW.assigned_to
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
      SELECT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::public.app_role, 'manager'::public.app_role)
        AND ur.user_id <> NEW.user_id
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

DROP POLICY IF EXISTS "notifications_task_review_actor_select_for_telegram" ON public.notifications;
CREATE POLICY "notifications_task_review_actor_select_for_telegram" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    COALESCE(type, kind) IN ('task_review', 'task_pending_review', 'checklist_pending_review', 'task_completion_pending_review')
    AND (
      actor_profile_id = public.get_current_profile_id()
      OR created_by = public.get_current_profile_id()
    )
  );

NOTIFY pgrst, 'reload schema';
