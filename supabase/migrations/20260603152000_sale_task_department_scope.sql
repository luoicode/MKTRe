-- Split checklist/task data by department so Marketing and Sale share the engine
-- without sharing operational task lists.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'marketing';

ALTER TABLE public.daily_task_templates
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'marketing';

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_department_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_department_check
  CHECK (department IN ('marketing', 'sale'));

ALTER TABLE public.daily_task_templates
  DROP CONSTRAINT IF EXISTS daily_task_templates_department_check;

ALTER TABLE public.daily_task_templates
  ADD CONSTRAINT daily_task_templates_department_check
  CHECK (department IN ('marketing', 'sale'));

UPDATE public.tasks t
SET department = COALESCE(NULLIF(team.department, ''), 'marketing')
FROM public.teams team
WHERE t.team_id = team.id
  AND COALESCE(NULLIF(team.department, ''), 'marketing') IN ('marketing', 'sale');

UPDATE public.daily_task_templates template
SET department = COALESCE(NULLIF(team.department, ''), 'marketing')
FROM public.teams team
WHERE template.team_id = team.id
  AND COALESCE(NULLIF(team.department, ''), 'marketing') IN ('marketing', 'sale');

CREATE INDEX IF NOT EXISTS idx_tasks_department_team_date
  ON public.tasks (department, team_id, task_date);

CREATE INDEX IF NOT EXISTS idx_daily_task_templates_department_active
  ON public.daily_task_templates (department, is_active, team_id);

CREATE OR REPLACE FUNCTION public.can_manage_team_kpi(_team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role('admin'::app_role)
    OR public.leads_team(_team_id)
    OR public.manager_leads_team(_team_id)
    OR EXISTS (
      SELECT 1
      FROM public.team_memberships tm
      WHERE tm.team_id = _team_id
        AND tm.user_id = public.get_current_profile_id()
        AND tm.role_in_team = 'leader'
        AND tm.is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.create_task_rpc(
  p_team_id uuid,
  p_assigned_to uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_deadline timestamptz DEFAULT NULL,
  p_task_date date DEFAULT current_date,
  p_priority text DEFAULT 'medium'
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
  v_priority text := COALESCE(NULLIF(p_priority, ''), 'medium');
  v_department text;
BEGIN
  SELECT p.id, ur.role
  INTO v_actor_id, v_actor_role
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.auth_user_id = auth.uid()
    AND ur.role IN (
      'admin'::public.app_role,
      'manager'::public.app_role,
      'leader'::public.app_role,
      'leader_sale'::public.app_role
    )
  ORDER BY CASE ur.role
    WHEN 'admin'::public.app_role THEN 1
    WHEN 'manager'::public.app_role THEN 2
    WHEN 'leader'::public.app_role THEN 3
    ELSE 4
  END
  LIMIT 1;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy profile người dùng hoặc bạn không có quyền giao task.';
  END IF;

  IF v_actor_role NOT IN (
    'admin'::public.app_role,
    'manager'::public.app_role,
    'leader'::public.app_role,
    'leader_sale'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Bạn không có quyền giao task.';
  END IF;

  IF p_team_id IS NULL OR p_assigned_to IS NULL THEN
    RAISE EXCEPTION 'Thiếu team hoặc nhân viên nhận task.';
  END IF;

  SELECT COALESCE(NULLIF(department, ''), 'marketing')
  INTO v_department
  FROM public.teams
  WHERE id = p_team_id;

  IF v_department NOT IN ('marketing', 'sale') THEN
    RAISE EXCEPTION 'Phòng ban của team không hợp lệ.';
  END IF;

  IF v_actor_role = 'leader'::public.app_role AND v_department <> 'marketing' THEN
    RAISE EXCEPTION 'Leader Marketing chỉ được giao task Marketing.';
  END IF;

  IF v_actor_role = 'leader_sale'::public.app_role AND v_department <> 'sale' THEN
    RAISE EXCEPTION 'Leader Sale chỉ được giao task Sale.';
  END IF;

  IF v_actor_role = 'manager'::public.app_role AND v_department <> 'marketing' THEN
    RAISE EXCEPTION 'Manager chỉ được giao task Marketing.';
  END IF;

  IF NULLIF(trim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Tiêu đề task không được để trống.';
  END IF;

  IF v_priority NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'Mức ưu tiên không hợp lệ.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles assignee
    WHERE assignee.id = p_assigned_to
      AND assignee.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Nhân viên nhận task phải đang active.';
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

  IF v_department = 'marketing' AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_assigned_to
      AND ur.role IN ('employee'::public.app_role, 'leader'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Task Marketing chỉ giao cho nhân sự Marketing.';
  END IF;

  IF v_department = 'sale' AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_assigned_to
      AND ur.role IN ('sale'::public.app_role, 'leader_sale'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Task Sale chỉ giao cho nhân sự Sale.';
  END IF;

  IF v_actor_role IN ('leader'::public.app_role, 'leader_sale'::public.app_role) AND NOT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.user_id = v_actor_id
      AND tm.team_id = p_team_id
      AND tm.is_active = true
      AND tm.role_in_team = 'leader'
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
    department,
    assigned_to,
    assigned_by,
    created_by,
    title,
    description,
    deadline,
    task_date,
    priority,
    status
  )
  VALUES (
    p_team_id,
    v_department,
    p_assigned_to,
    v_actor_id,
    v_actor_id,
    trim(p_title),
    NULLIF(trim(COALESCE(p_description, '')), ''),
    p_deadline,
    COALESCE(p_task_date, current_date),
    v_priority,
    'todo'::public.task_status
  )
  RETURNING * INTO v_task;

  RETURN v_task;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_task_rpc(uuid, uuid, text, text, timestamptz, date, text)
TO authenticated;

NOTIFY pgrst, 'reload schema';
