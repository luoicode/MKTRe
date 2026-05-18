CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status text NOT NULL DEFAULT 'present',
  checked_in_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, attendance_date),
  CONSTRAINT attendance_records_status_check
    CHECK (status IN ('present', 'absent', 'leave_requested', 'approved_leave', 'rejected_leave'))
);

CREATE TABLE IF NOT EXISTS public.daily_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_checklist_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.daily_checklist_templates(id) ON DELETE CASCADE,
  completion_date date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  proof_url text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, template_id, completion_date)
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT leave_requests_date_check CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_user_date
  ON public.attendance_records(user_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_checklist_completions_user_date
  ON public.daily_checklist_completions(user_id, completion_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_dates
  ON public.leave_requests(user_id, start_date DESC, end_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status
  ON public.leave_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_checklist_templates_active
  ON public.daily_checklist_templates(sort_order, created_at) WHERE is_active = true;

DROP TRIGGER IF EXISTS tr_attendance_records_updated ON public.attendance_records;
CREATE TRIGGER tr_attendance_records_updated
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tr_daily_checklist_templates_updated ON public.daily_checklist_templates;
CREATE TRIGGER tr_daily_checklist_templates_updated
  BEFORE UPDATE ON public.daily_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tr_leave_requests_updated ON public.leave_requests;
CREATE TRIGGER tr_leave_requests_updated
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_checklist_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.leader_membership_scopes_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships employee_membership
    JOIN public.team_memberships leader_membership
      ON leader_membership.team_id = employee_membership.team_id
     AND leader_membership.is_active = true
    JOIN public.user_roles leader_role
      ON leader_role.user_id = leader_membership.user_id
     AND leader_role.role = 'leader'::public.app_role
    WHERE employee_membership.user_id = _user_id
      AND employee_membership.is_active = true
      AND leader_membership.user_id = public.get_current_profile_id()
  );
$$;

DROP POLICY IF EXISTS attendance_records_select_scoped ON public.attendance_records;
CREATE POLICY attendance_records_select_scoped ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    public.can_view_user(user_id)
    OR public.leader_membership_scopes_user(user_id)
    OR public.is_manager()
  );

DROP POLICY IF EXISTS attendance_records_employee_upsert_own ON public.attendance_records;
CREATE POLICY attendance_records_employee_upsert_own ON public.attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS attendance_records_employee_update_own ON public.attendance_records;
CREATE POLICY attendance_records_employee_update_own ON public.attendance_records
  FOR UPDATE TO authenticated
  USING (
    user_id = public.get_current_profile_id()
    OR public.has_role('admin'::public.app_role)
    OR public.is_manager()
  )
  WITH CHECK (
    user_id = public.get_current_profile_id()
    OR public.has_role('admin'::public.app_role)
    OR public.is_manager()
  );

DROP POLICY IF EXISTS daily_checklist_templates_select_active ON public.daily_checklist_templates;
CREATE POLICY daily_checklist_templates_select_active ON public.daily_checklist_templates
  FOR SELECT TO authenticated
  USING (
    is_active = true
    OR public.has_role('admin'::public.app_role)
    OR public.is_manager()
  );

DROP POLICY IF EXISTS daily_checklist_templates_admin_manager_all ON public.daily_checklist_templates;
CREATE POLICY daily_checklist_templates_admin_manager_all ON public.daily_checklist_templates
  FOR ALL TO authenticated
  USING (public.has_role('admin'::public.app_role) OR public.is_manager())
  WITH CHECK (public.has_role('admin'::public.app_role) OR public.is_manager());

DROP POLICY IF EXISTS daily_checklist_completions_select_scoped ON public.daily_checklist_completions;
CREATE POLICY daily_checklist_completions_select_scoped ON public.daily_checklist_completions
  FOR SELECT TO authenticated
  USING (
    public.can_view_user(user_id)
    OR public.leader_membership_scopes_user(user_id)
    OR public.is_manager()
  );

DROP POLICY IF EXISTS daily_checklist_completions_insert_own ON public.daily_checklist_completions;
CREATE POLICY daily_checklist_completions_insert_own ON public.daily_checklist_completions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS daily_checklist_completions_update_own ON public.daily_checklist_completions;
CREATE POLICY daily_checklist_completions_update_own ON public.daily_checklist_completions
  FOR UPDATE TO authenticated
  USING (user_id = public.get_current_profile_id())
  WITH CHECK (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS daily_checklist_completions_delete_own ON public.daily_checklist_completions;
CREATE POLICY daily_checklist_completions_delete_own ON public.daily_checklist_completions
  FOR DELETE TO authenticated
  USING (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS leave_requests_select_scoped ON public.leave_requests;
CREATE POLICY leave_requests_select_scoped ON public.leave_requests
  FOR SELECT TO authenticated
  USING (
    public.can_view_user(user_id)
    OR public.leader_membership_scopes_user(user_id)
    OR public.is_manager()
  );

DROP POLICY IF EXISTS leave_requests_insert_own ON public.leave_requests;
CREATE POLICY leave_requests_insert_own ON public.leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS leave_requests_employee_update_pending_own ON public.leave_requests;
CREATE POLICY leave_requests_employee_update_pending_own ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (user_id = public.get_current_profile_id() AND status = 'pending')
  WITH CHECK (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS leave_requests_review_scoped ON public.leave_requests;
CREATE POLICY leave_requests_review_scoped ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (
    public.has_role('admin'::public.app_role)
    OR public.is_manager()
    OR public.user_in_my_team(user_id)
    OR public.leader_membership_scopes_user(user_id)
  )
  WITH CHECK (
    public.has_role('admin'::public.app_role)
    OR public.is_manager()
    OR public.user_in_my_team(user_id)
    OR public.leader_membership_scopes_user(user_id)
  );

CREATE OR REPLACE FUNCTION public.notify_leave_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_name text;
  v_target record;
BEGIN
  SELECT COALESCE(full_name, username, 'Nhân sự')
  INTO v_employee_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  FOR v_target IN
    SELECT DISTINCT leader_membership.user_id AS profile_id
    FROM public.team_memberships employee_membership
    JOIN public.team_memberships leader_membership
      ON leader_membership.team_id = employee_membership.team_id
     AND leader_membership.is_active = true
    JOIN public.user_roles ur
      ON ur.user_id = leader_membership.user_id
     AND ur.role = 'leader'::public.app_role
    WHERE employee_membership.user_id = NEW.user_id
      AND employee_membership.is_active = true
      AND leader_membership.user_id <> NEW.user_id
  LOOP
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
    VALUES (
      v_target.profile_id,
      NEW.user_id,
      v_target.profile_id,
      NEW.user_id,
      'leave_request',
      'leave_request',
      'team',
      'leave_request',
      NEW.id,
      'Có đơn xin nghỉ mới',
      v_employee_name || ' vừa gửi đơn xin nghỉ.',
      v_employee_name || ' vừa gửi đơn xin nghỉ.',
      'warning',
      false,
      jsonb_build_object(
        'leave_request_id', NEW.id,
        'start_date', NEW.start_date,
        'end_date', NEW.end_date
      ),
      'team',
      NULL
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_leave_request_reviewed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = NEW.status OR NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

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
  VALUES (
    NEW.user_id,
    NEW.reviewed_by,
    NEW.user_id,
    NEW.reviewed_by,
    CASE WHEN NEW.status = 'approved' THEN 'leave_approved' ELSE 'leave_rejected' END,
    CASE WHEN NEW.status = 'approved' THEN 'leave_approved' ELSE 'leave_rejected' END,
    'personal',
    'leave_request',
    NEW.id,
    CASE WHEN NEW.status = 'approved' THEN 'Đơn nghỉ đã được duyệt' ELSE 'Đơn nghỉ bị từ chối' END,
    COALESCE(NEW.review_note, CASE WHEN NEW.status = 'approved' THEN 'Đơn xin nghỉ của bạn đã được duyệt.' ELSE 'Đơn xin nghỉ của bạn chưa được duyệt.' END),
    COALESCE(NEW.review_note, CASE WHEN NEW.status = 'approved' THEN 'Đơn xin nghỉ của bạn đã được duyệt.' ELSE 'Đơn xin nghỉ của bạn chưa được duyệt.' END),
    CASE WHEN NEW.status = 'approved' THEN 'success' ELSE 'error' END,
    false,
    jsonb_build_object(
      'leave_request_id', NEW.id,
      'status', NEW.status,
      'review_note', NEW.review_note
    ),
    'personal',
    NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_leave_request_notify_created ON public.leave_requests;
CREATE TRIGGER tr_leave_request_notify_created
  AFTER INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_leave_request_created();

DROP TRIGGER IF EXISTS tr_leave_request_notify_reviewed ON public.leave_requests;
CREATE TRIGGER tr_leave_request_notify_reviewed
  AFTER UPDATE OF status ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_leave_request_reviewed();

INSERT INTO public.daily_checklist_templates (title, description, sort_order, is_active)
SELECT seed.title, seed.description, seed.sort_order, true
FROM (
  VALUES
    ('Điểm danh & cập nhật trạng thái công việc', 'Xác nhận có mặt và cập nhật nhanh việc cần xử lý trong ngày.', 10),
    ('Kiểm tra quảng cáo đang chạy', 'Rà soát trạng thái chiến dịch, ngân sách, tin nhắn và cảnh báo bất thường.', 20),
    ('Báo cáo đầu ngày', 'Chuẩn bị số liệu và ghi chú các vấn đề cần leader hỗ trợ.', 30)
) AS seed(title, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.daily_checklist_templates existing
  WHERE lower(existing.title) = lower(seed.title)
);

NOTIFY pgrst, 'reload schema';
