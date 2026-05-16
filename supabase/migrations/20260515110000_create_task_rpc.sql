-- Create task through a SECURITY DEFINER RPC so assignment rules are validated inside the DB.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.create_task_rpc(
  p_team_id uuid,
  p_assigned_to uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_deadline timestamptz DEFAULT NULL,
  p_task_date date DEFAULT current_date
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role public.app_role;
  v_task public.tasks;
BEGIN
  SELECT p.id, ur.role
  INTO v_actor_id, v_actor_role
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.auth_user_id = auth.uid()
    AND ur.role IN ('leader'::public.app_role, 'manager'::public.app_role)
  ORDER BY CASE ur.role WHEN 'manager'::public.app_role THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy profile người dùng hoặc bạn không có quyền giao task.';
  END IF;

  IF v_actor_role NOT IN ('leader'::public.app_role, 'manager'::public.app_role) THEN
    RAISE EXCEPTION 'Bạn không có quyền giao task.';
  END IF;

  IF p_team_id IS NULL OR p_assigned_to IS NULL THEN
    RAISE EXCEPTION 'Thiếu team hoặc nhân viên nhận task.';
  END IF;

  IF NULLIF(trim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Tiêu đề task không được để trống.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.user_id = p_assigned_to
      AND tm.team_id = p_team_id
      AND tm.is_active = true
  ) THEN
    RAISE EXCEPTION 'Nhân viên không thuộc team này.';
  END IF;

  IF v_actor_role = 'leader'::public.app_role AND NOT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.user_id = v_actor_id
      AND tm.team_id = p_team_id
      AND tm.is_active = true
  ) THEN
    RAISE EXCEPTION 'Leader chỉ được giao task trong team của mình.';
  END IF;

  IF v_actor_role = 'manager'::public.app_role AND NOT EXISTS (
    SELECT 1
    FROM public.manager_team_assignments mta
    WHERE mta.manager_id = v_actor_id
      AND mta.team_id = p_team_id
      AND mta.is_active = true
  ) THEN
    RAISE EXCEPTION 'Manager chỉ được giao task cho team được quản lý.';
  END IF;

  INSERT INTO public.tasks (
    team_id,
    assigned_to,
    assigned_by,
    created_by,
    title,
    description,
    deadline,
    task_date,
    status
  )
  VALUES (
    p_team_id,
    p_assigned_to,
    v_actor_id,
    v_actor_id,
    trim(p_title),
    NULLIF(trim(COALESCE(p_description, '')), ''),
    p_deadline,
    COALESCE(p_task_date, current_date),
    'todo'::public.task_status
  )
  RETURNING * INTO v_task;

  RETURN v_task;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_task_rpc(uuid, uuid, text, text, timestamptz, date)
TO authenticated;

NOTIFY pgrst, 'reload schema';
