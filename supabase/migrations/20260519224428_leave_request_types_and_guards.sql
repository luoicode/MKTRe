ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS leave_type text NOT NULL DEFAULT 'full_day';

ALTER TABLE public.leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;

ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_leave_type_check
  CHECK (leave_type IN ('full_day', 'half_day', 'early_leave', 'late_arrival'));

CREATE INDEX IF NOT EXISTS idx_leave_requests_user_status_dates
  ON public.leave_requests(user_id, status, start_date, end_date);

CREATE OR REPLACE FUNCTION public.guard_leave_request_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := public.get_current_profile_id();
  current_day date;
  day_request_count integer;
  has_pending boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'Bạn chỉ được tạo đơn xin nghỉ cho chính mình';
  END IF;

  IF NEW.start_date <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
    RAISE EXCEPTION 'Đơn xin nghỉ cần được tạo trước ít nhất 1 ngày.';
  END IF;

  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Ngày kết thúc không hợp lệ';
  END IF;

  current_day := NEW.start_date;
  WHILE current_day <= NEW.end_date LOOP
    SELECT COUNT(*)
    INTO day_request_count
    FROM public.leave_requests lr
    WHERE lr.user_id = NEW.user_id
      AND lr.start_date <= current_day
      AND lr.end_date >= current_day;

    IF day_request_count >= 2 THEN
      RAISE EXCEPTION 'Mỗi ngày chỉ được tạo tối đa 2 đơn xin nghỉ';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.leave_requests lr
      WHERE lr.user_id = NEW.user_id
        AND lr.status = 'pending'
        AND lr.start_date <= current_day
        AND lr.end_date >= current_day
    )
    INTO has_pending;

    IF has_pending THEN
      RAISE EXCEPTION 'Bạn đang có đơn xin nghỉ chờ duyệt trong ngày này';
    END IF;

    current_day := current_day + 1;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_leave_request_create ON public.leave_requests;
CREATE TRIGGER tr_guard_leave_request_create
  BEFORE INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_leave_request_create();

NOTIFY pgrst, 'reload schema';
