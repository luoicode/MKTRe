-- Approval notification hardening: explicit approval types, richer metadata,
-- rejected-state triggers, and onboarding review RPC for Telegram/web actions.

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
    (old_status = 'pending_review' AND new_status IN ('done', 'in_progress', 'todo', 'rejected'))
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.review_feedback IS DISTINCT FROM OLD.review_feedback;

  IF is_review_change
    AND NOT public.can_review_user_as_current_actor(OLD.assigned_to)
    AND NOT public.can_review_user_as_actor(NEW.reviewed_by, OLD.assigned_to)
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
    (old_status = 'pending_review' AND new_status IN ('done', 'in_progress', 'todo', 'rejected'))
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.review_feedback IS DISTINCT FROM OLD.review_feedback;

  IF is_review_change
    AND NOT public.can_review_user_as_current_actor(OLD.user_id)
    AND NOT public.can_review_user_as_actor(NEW.reviewed_by, OLD.user_id)
  THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt mục này';
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
  team_name text;
BEGIN
  SELECT COALESCE(full_name, username, 'Nhân viên')
    INTO assignee_name
  FROM public.profiles
  WHERE id = NEW.assigned_to;

  SELECT name INTO team_name FROM public.teams WHERE id = NEW.team_id;

  IF NEW.status::text = 'pending_review'
     AND COALESCE(OLD.status::text, '') <> 'pending_review' THEN
    PERFORM public.emit_notification(
      recipients.user_id,
      NEW.assigned_to,
      'task_pending_review',
      'team',
      'task',
      NEW.id,
      assignee_name || ' đã gửi duyệt task',
      NEW.title,
      'warning',
      jsonb_build_object(
        'team_id', NEW.team_id,
        'team_name', team_name,
        'task_id', NEW.id,
        'task_title', NEW.title,
        'title', NEW.title,
        'item_type', 'Task',
        'submitter_id', NEW.assigned_to,
        'submitter_name', assignee_name,
        'assignee_name', assignee_name,
        'deadline', NEW.deadline,
        'description', NEW.description,
        'link_url', NEW.link_url,
        'proof_url', NEW.proof_url,
        'completion_note', NEW.completion_note,
        'review_feedback', NEW.review_feedback,
        'priority', NEW.priority,
        'dedupe_key', 'task_pending_review:' || NEW.id::text || ':recipient:' || recipients.user_id::text
      )
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
      jsonb_build_object('team_id', NEW.team_id, 'team_name', team_name, 'task_title', NEW.title)
    );
  END IF;

  IF NEW.status::text IN ('todo', 'in_progress', 'rejected')
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
      jsonb_build_object(
        'team_id', NEW.team_id,
        'team_name', team_name,
        'task_title', NEW.title,
        'review_feedback', NEW.review_feedback
      )
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
  template_description text;
  team_name text;
  actor_name text;
  previous_status text := '';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    previous_status := COALESCE(OLD.status, '');
  END IF;

  SELECT team_id, title, description
    INTO template_team_id, template_title, template_description
  FROM public.daily_task_templates
  WHERE id = NEW.template_id;

  SELECT name INTO team_name FROM public.teams WHERE id = template_team_id;

  SELECT COALESCE(full_name, username, 'Nhân viên')
    INTO actor_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF COALESCE(NEW.status, '') = 'pending_review'
     AND previous_status <> 'pending_review' THEN
    PERFORM public.emit_notification(
      recipients.user_id,
      NEW.user_id,
      'checklist_pending_review',
      'team',
      'task_completion',
      NEW.id,
      actor_name || ' đã gửi duyệt checklist',
      template_title,
      'warning',
      jsonb_build_object(
        'team_id', template_team_id,
        'team_name', team_name,
        'template_id', NEW.template_id,
        'template_title', template_title,
        'title', template_title,
        'item_type', 'Checklist thường ngày',
        'submitter_id', NEW.user_id,
        'submitter_name', actor_name,
        'assignee_name', actor_name,
        'completion_date', NEW.completion_date,
        'description', template_description,
        'proof_url', NEW.proof_url,
        'completion_note', COALESCE(NEW.completion_note, NEW.note),
        'review_feedback', NEW.review_feedback,
        'priority', NEW.priority,
        'dedupe_key', 'checklist_pending_review:' || NEW.id::text || ':recipient:' || recipients.user_id::text
      )
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
      jsonb_build_object('team_id', template_team_id, 'team_name', team_name, 'template_title', template_title)
    );
  END IF;

  IF COALESCE(NEW.status, '') IN ('todo', 'in_progress', 'rejected')
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
      jsonb_build_object(
        'team_id', template_team_id,
        'team_name', team_name,
        'template_title', template_title,
        'review_feedback', NEW.review_feedback
      )
    );
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
      RETURN jsonb_build_object('status', 'duplicate', 'message', 'Mục này đã được xử lý trước đó.');
    END IF;

    IF NOT public.can_review_user_as_actor(_reviewer_profile_id, v_target_user_id) THEN
      RETURN jsonb_build_object('status', 'denied', 'message', 'Bạn không có quyền duyệt mục này.');
    END IF;

    UPDATE public.tasks
    SET status = CASE WHEN _approved THEN 'done'::public.task_status ELSE 'rejected'::public.task_status END,
        completed_at = CASE WHEN _approved THEN v_now ELSE NULL END,
        reviewed_by = _reviewer_profile_id,
        reviewed_at = v_now,
        review_feedback = CASE WHEN _approved THEN NULL ELSE 'Không duyệt từ Telegram' END
    WHERE id = _entity_id;

    RETURN jsonb_build_object('status', 'success', 'message', CASE WHEN _approved THEN 'Đã duyệt task.' ELSE 'Đã không duyệt task.' END);
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
      RETURN jsonb_build_object('status', 'duplicate', 'message', 'Mục này đã được xử lý trước đó.');
    END IF;

    IF NOT public.can_review_user_as_actor(_reviewer_profile_id, v_target_user_id) THEN
      RETURN jsonb_build_object('status', 'denied', 'message', 'Bạn không có quyền duyệt mục này.');
    END IF;

    UPDATE public.task_completions
    SET status = CASE WHEN _approved THEN 'done' ELSE 'rejected' END,
        completed = _approved,
        completed_at = CASE WHEN _approved THEN v_now ELSE NULL END,
        reviewed_by = _reviewer_profile_id,
        reviewed_at = v_now,
        review_feedback = CASE WHEN _approved THEN NULL ELSE 'Không duyệt từ Telegram' END
    WHERE id = _entity_id;

    RETURN jsonb_build_object('status', 'success', 'message', CASE WHEN _approved THEN 'Đã duyệt checklist.' ELSE 'Đã không duyệt checklist.' END);
  END IF;

  RETURN jsonb_build_object('status', 'failed', 'message', 'Loại mục không hợp lệ.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.telegram_review_task(uuid, text, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.telegram_review_onboarding_answer(
  _reviewer_profile_id uuid,
  _answer_id uuid,
  _approved boolean,
  _feedback text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_target_user_id uuid;
  v_section_title text;
  v_status text;
  v_message text;
  v_type text;
BEGIN
  IF _reviewer_profile_id IS NULL OR _answer_id IS NULL THEN
    RETURN jsonb_build_object('status', 'failed', 'message', 'Thiếu dữ liệu duyệt onboarding.');
  END IF;

  SELECT answer.profile_id, answer.status, section.title
  INTO v_target_user_id, v_status, v_section_title
  FROM public.onboarding_answers answer
  LEFT JOIN public.onboarding_sections section ON section.id = answer.section_id
  WHERE answer.id = _answer_id;

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'failed', 'message', 'Không tìm thấy onboarding.');
  END IF;

  IF v_status <> 'submitted' THEN
    RETURN jsonb_build_object('status', 'duplicate', 'message', 'Mục này đã được xử lý trước đó.');
  END IF;

  IF NOT public.can_review_user_as_actor(_reviewer_profile_id, v_target_user_id) THEN
    RETURN jsonb_build_object('status', 'denied', 'message', 'Bạn không có quyền duyệt mục này.');
  END IF;

  UPDATE public.onboarding_answers
  SET status = CASE WHEN _approved THEN 'approved' ELSE 'rejected' END,
      reviewed_by = _reviewer_profile_id,
      reviewed_at = v_now,
      review_note = CASE WHEN _approved THEN NULL ELSE COALESCE(NULLIF(_feedback, ''), 'Không duyệt từ Telegram') END
  WHERE id = _answer_id;

  v_type := CASE WHEN _approved THEN 'onboarding_approved' ELSE 'onboarding_rejected' END;
  v_message := CASE
    WHEN _approved THEN 'Section ' || COALESCE(v_section_title, 'onboarding') || ' đã được duyệt.'
    ELSE COALESCE(NULLIF(_feedback, ''), 'Section onboarding cần làm lại.')
  END;

  PERFORM public.emit_notification(
    v_target_user_id,
    _reviewer_profile_id,
    v_type,
    'personal',
    'onboarding_answer',
    _answer_id,
    CASE WHEN _approved THEN 'Onboarding đã được duyệt' ELSE 'Cần làm lại onboarding' END,
    v_message,
    CASE WHEN _approved THEN 'success' ELSE 'error' END,
    jsonb_build_object(
      'answer_id', _answer_id,
      'section_title', v_section_title,
      'review_note', CASE WHEN _approved THEN NULL ELSE COALESCE(NULLIF(_feedback, ''), 'Không duyệt từ Telegram') END
    )
  );

  RETURN jsonb_build_object('status', 'success', 'message', CASE WHEN _approved THEN 'Đã duyệt onboarding.' ELSE 'Đã không duyệt onboarding.' END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.telegram_review_onboarding_answer(uuid, uuid, boolean, text) TO authenticated;

DROP POLICY IF EXISTS "notifications_approval_actor_select_for_telegram" ON public.notifications;
CREATE POLICY "notifications_approval_actor_select_for_telegram" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    COALESCE(type, kind) IN (
      'task_review',
      'task_pending_review',
      'checklist_pending_review',
      'task_completion_pending_review',
      'onboarding_pending_review',
      'onboarding_review',
      'onboarding_review_pending',
      'leave_request_created'
    )
    AND (
      actor_profile_id = public.get_current_profile_id()
      OR created_by = public.get_current_profile_id()
      OR target_profile_id = public.get_current_profile_id()
      OR user_id = public.get_current_profile_id()
    )
  );

CREATE OR REPLACE FUNCTION public.notify_leave_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_name text;
  v_team_id uuid;
  v_team_name text;
  v_target record;
  v_dedupe_key text;
  v_start_label text := to_char(NEW.start_date::date, 'DD/MM/YYYY');
  v_end_label text := to_char(NEW.end_date::date, 'DD/MM/YYYY');
BEGIN
  SELECT COALESCE(full_name, username, 'Nhân sự')
  INTO v_requester_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  SELECT tm.team_id
  INTO v_team_id
  FROM public.team_memberships tm
  WHERE tm.user_id = NEW.user_id
    AND tm.is_active = true
  ORDER BY tm.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT name INTO v_team_name FROM public.teams WHERE id = v_team_id;

  FOR v_target IN
    WITH requester_teams AS (
      SELECT tm.team_id
      FROM public.team_memberships tm
      WHERE tm.user_id = NEW.user_id
        AND tm.is_active = true
    ),
    leader_recipients AS (
      SELECT DISTINCT leader_membership.user_id AS profile_id
      FROM requester_teams rt
      JOIN public.team_memberships leader_membership
        ON leader_membership.team_id = rt.team_id
       AND leader_membership.is_active = true
      JOIN public.user_roles ur
        ON ur.user_id = leader_membership.user_id
       AND ur.role = 'leader'::public.app_role
      WHERE leader_membership.user_id <> NEW.user_id
    ),
    admin_manager_recipients AS (
      SELECT DISTINCT ur.user_id AS profile_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::public.app_role, 'manager'::public.app_role)
        AND ur.user_id <> NEW.user_id
    )
    SELECT DISTINCT profile_id
    FROM (
      SELECT profile_id FROM leader_recipients
      UNION
      SELECT profile_id FROM admin_manager_recipients
    ) recipients
    WHERE profile_id IS NOT NULL
  LOOP
    v_dedupe_key := 'leave_request:' || NEW.id::text || ':recipient:' || v_target.profile_id::text;

    INSERT INTO public.notifications (
      target_profile_id,
      actor_profile_id,
      user_id,
      created_by,
      type,
      kind,
      scope,
      entity_type,
      entity_id,
      title,
      message,
      body,
      severity,
      is_read,
      metadata,
      target_scope,
      team_id
    )
    SELECT
      v_target.profile_id,
      NEW.user_id,
      v_target.profile_id,
      NEW.user_id,
      'leave_request_created',
      'leave_request_created',
      'team',
      'leave_request',
      NEW.id,
      'Có đơn xin nghỉ mới',
      v_requester_name || ' xin nghỉ từ ' || v_start_label || ' đến ' || v_end_label,
      v_requester_name || ' xin nghỉ từ ' || v_start_label || ' đến ' || v_end_label,
      'warning',
      false,
      jsonb_build_object(
        'leave_request_id', NEW.id,
        'requester_id', NEW.user_id,
        'requester_name', v_requester_name,
        'team_id', v_team_id,
        'team_name', v_team_name,
        'leave_type', COALESCE(NEW.leave_type, 'full_day'),
        'start_date', NEW.start_date,
        'end_date', NEW.end_date,
        'reason', NEW.reason,
        'submitted_at', NEW.created_at,
        'dedupe_key', v_dedupe_key
      ),
      'team',
      v_team_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.notifications existing
      WHERE existing.metadata ->> 'dedupe_key' = v_dedupe_key
    );
  END LOOP;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
