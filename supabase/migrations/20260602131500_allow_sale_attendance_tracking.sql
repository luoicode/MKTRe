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
      AND ur.role IN (
        'employee'::public.app_role,
        'leader'::public.app_role,
        'sale'::public.app_role,
        'leader_sale'::public.app_role
      )
      AND COALESCE(p.status, 'active') = 'active'
  );
$$;

NOTIFY pgrst, 'reload schema';
