CREATE OR REPLACE FUNCTION public.can_review_user_as_current_actor(_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role('admin'::public.app_role)
    OR public.is_manager()
    OR (
      public.has_role('leader'::public.app_role)
      AND _target_user_id IS NOT NULL
      AND _target_user_id <> public.get_current_profile_id()
      AND EXISTS (
        SELECT 1
        FROM public.user_roles target_role
        WHERE target_role.user_id = _target_user_id
          AND target_role.role = 'employee'::public.app_role
      )
      AND public.leader_membership_scopes_user(_target_user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.guard_attendance_record_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := public.get_current_profile_id();
BEGIN
  IF public.has_role('admin'::public.app_role) OR public.is_manager() THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id = actor_id AND NEW.status = 'present' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Bạn không có quyền duyệt mục này';
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_attendance_record_write ON public.attendance_records;
CREATE TRIGGER tr_guard_attendance_record_write
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_record_write();

CREATE OR REPLACE FUNCTION public.guard_leave_request_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (
      NEW.status IS DISTINCT FROM OLD.status
      OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.review_note IS DISTINCT FROM OLD.review_note
    )
    AND NEW.status IN ('approved', 'rejected')
    AND NOT public.can_review_user_as_current_actor(OLD.user_id)
  THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt mục này';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_leave_request_review ON public.leave_requests;
CREATE TRIGGER tr_guard_leave_request_review
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_leave_request_review();

DROP POLICY IF EXISTS leave_requests_review_scoped ON public.leave_requests;
CREATE POLICY leave_requests_review_scoped ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (public.can_review_user_as_current_actor(user_id))
  WITH CHECK (public.can_review_user_as_current_actor(user_id));

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
    AND NOT public.can_review_user_as_current_actor(OLD.assigned_to)
  THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt mục này';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_task_review_permission ON public.tasks;
CREATE TRIGGER tr_guard_task_review_permission
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_task_review_permission();

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
    AND NOT public.can_review_user_as_current_actor(OLD.user_id)
  THEN
    RAISE EXCEPTION 'Bạn không có quyền duyệt mục này';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_task_completion_review_permission ON public.task_completions;
CREATE TRIGGER tr_guard_task_completion_review_permission
  BEFORE UPDATE ON public.task_completions
  FOR EACH ROW EXECUTE FUNCTION public.guard_task_completion_review_permission();

DROP POLICY IF EXISTS "tasks_manager_update_all" ON public.tasks;
CREATE POLICY "tasks_manager_update_all" ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS "task_completions_manager_update_all" ON public.task_completions;
CREATE POLICY "task_completions_manager_update_all" ON public.task_completions
  FOR UPDATE TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

NOTIFY pgrst, 'reload schema';
