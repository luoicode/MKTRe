DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'task_status'
      AND e.enumlabel = 'pending_review'
  ) THEN
    ALTER TYPE public.task_status ADD VALUE 'pending_review';
  END IF;
END $$;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS review_feedback text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.task_completions
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'todo',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS review_feedback text,
  ADD COLUMN IF NOT EXISTS proof_url text,
  ADD COLUMN IF NOT EXISTS completion_note text;

CREATE INDEX IF NOT EXISTS idx_task_completions_status_date
  ON public.task_completions(status, completion_date);

CREATE OR REPLACE FUNCTION public.prevent_employee_task_ownership_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role('admin'::app_role)
    OR (OLD.team_id IS NOT NULL AND public.can_manage_team_kpi(OLD.team_id))
  THEN
    RETURN NEW;
  END IF;

  IF OLD.assigned_to = public.get_current_profile_id() THEN
    IF NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
      OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
      OR NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.task_date IS DISTINCT FROM OLD.task_date
      OR NEW.deadline IS DISTINCT FROM OLD.deadline
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.review_feedback IS DISTINCT FROM OLD.review_feedback
    THEN
      RAISE EXCEPTION 'Employees may only update task progress and submission details';
    END IF;
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
    INSERT INTO public.notifications (
      title, body, kind, target_scope, user_id, team_id, created_by
    )
    SELECT DISTINCT
      assignee_name || ' đã gửi duyệt task',
      NEW.title,
      'task',
      'user',
      recipients.user_id,
      NULL::uuid,
      NEW.assigned_to
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
    INSERT INTO public.notifications (
      title, body, kind, target_scope, user_id, team_id, created_by
    )
    VALUES (
      'Task đã được duyệt hoàn thành',
      NEW.title,
      'task',
      'user',
      NEW.assigned_to,
      NULL::uuid,
      COALESCE(NEW.reviewed_by, public.get_current_profile_id())
    );
  END IF;

  IF NEW.status::text IN ('todo', 'in_progress')
     AND COALESCE(OLD.status::text, '') = 'pending_review' THEN
    INSERT INTO public.notifications (
      title, body, kind, target_scope, user_id, team_id, created_by
    )
    VALUES (
      'Task cần làm lại',
      COALESCE(NULLIF(NEW.review_feedback, ''), NEW.title),
      'task',
      'user',
      NEW.assigned_to,
      NULL::uuid,
      COALESCE(NEW.reviewed_by, public.get_current_profile_id())
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
    INSERT INTO public.notifications (
      title, body, kind, target_scope, user_id, team_id, created_by
    )
    SELECT DISTINCT
      actor_name || ' đã gửi duyệt checklist',
      template_title,
      'task',
      'user',
      recipients.user_id,
      NULL::uuid,
      NEW.user_id
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
    INSERT INTO public.notifications (
      title, body, kind, target_scope, user_id, team_id, created_by
    )
    VALUES (
      'Checklist đã được duyệt hoàn thành',
      template_title,
      'task',
      'user',
      NEW.user_id,
      NULL::uuid,
      COALESCE(NEW.reviewed_by, public.get_current_profile_id())
    );
  END IF;

  IF COALESCE(NEW.status, '') IN ('todo', 'in_progress')
     AND previous_status = 'pending_review' THEN
    INSERT INTO public.notifications (
      title, body, kind, target_scope, user_id, team_id, created_by
    )
    VALUES (
      'Checklist cần làm lại',
      COALESCE(NULLIF(NEW.review_feedback, ''), template_title),
      'task',
      'user',
      NEW.user_id,
      NULL::uuid,
      COALESCE(NEW.reviewed_by, public.get_current_profile_id())
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "task_completions_manager_update" ON public.task_completions;
CREATE POLICY "task_completions_manager_update" ON public.task_completions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.daily_task_templates dtt
      WHERE dtt.id = task_completions.template_id
        AND dtt.team_id IS NOT NULL
        AND public.can_view_team(dtt.team_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.daily_task_templates dtt
      WHERE dtt.id = task_completions.template_id
        AND dtt.team_id IS NOT NULL
        AND public.can_view_team(dtt.team_id)
    )
  );

NOTIFY pgrst, 'reload schema';
