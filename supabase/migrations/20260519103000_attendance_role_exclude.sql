CREATE OR REPLACE FUNCTION public.is_attendance_tracked_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('employee'::public.app_role, 'leader'::public.app_role)
      AND COALESCE(p.status, 'active') = 'active'
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
  IF NOT public.is_attendance_tracked_user(NEW.user_id) THEN
    RAISE EXCEPTION 'Admin/Manager không cần điểm danh';
  END IF;

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

NOTIFY pgrst, 'reload schema';
