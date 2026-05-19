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

CREATE OR REPLACE FUNCTION public.telegram_review_leave_request(
  _reviewer_profile_id uuid,
  _leave_request_id uuid,
  _approved boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_requester_id uuid;
  v_status text;
  v_start_date date;
  v_end_date date;
BEGIN
  IF _reviewer_profile_id IS NULL OR _leave_request_id IS NULL THEN
    RETURN jsonb_build_object('status', 'failed', 'message', 'Thiếu dữ liệu duyệt đơn nghỉ.');
  END IF;

  SELECT user_id, status, start_date, end_date
  INTO v_requester_id, v_status, v_start_date, v_end_date
  FROM public.leave_requests
  WHERE id = _leave_request_id;

  IF v_requester_id IS NULL THEN
    RETURN jsonb_build_object('status', 'failed', 'message', 'Không tìm thấy đơn nghỉ.');
  END IF;

  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object(
      'status', 'duplicate',
      'message', 'Đơn này đã được xử lý trước đó.',
      'target_profile_id', v_requester_id,
      'start_date', v_start_date,
      'end_date', v_end_date
    );
  END IF;

  IF NOT public.can_review_user_as_actor(_reviewer_profile_id, v_requester_id) THEN
    RETURN jsonb_build_object('status', 'denied', 'message', 'Bạn không có quyền duyệt mục này.');
  END IF;

  UPDATE public.leave_requests
  SET status = CASE WHEN _approved THEN 'approved' ELSE 'rejected' END,
      reviewed_by = _reviewer_profile_id,
      reviewed_at = v_now,
      review_note = CASE WHEN _approved THEN NULL ELSE 'Không duyệt từ Telegram' END
  WHERE id = _leave_request_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', CASE WHEN _approved THEN 'Đã duyệt đơn nghỉ.' ELSE 'Đã không duyệt đơn nghỉ.' END,
    'target_profile_id', v_requester_id,
    'start_date', v_start_date,
    'end_date', v_end_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.telegram_review_leave_request(uuid, uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
