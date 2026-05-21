-- Fix task_completions approval notification trigger.
-- task_completions has no priority column, so the trigger must not reference NEW.priority.

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
        'priority', NULL,
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
      jsonb_build_object(
        'team_id', template_team_id,
        'team_name', team_name,
        'template_title', template_title
      )
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
