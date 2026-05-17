-- Dynamic onboarding task templates for new employees.

CREATE TABLE IF NOT EXISTS public.onboarding_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium',
  deadline_hours integer NOT NULL DEFAULT 24,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_task_templates_priority_check
    CHECK (priority IN ('low', 'medium', 'high')),
  CONSTRAINT onboarding_task_templates_deadline_hours_check
    CHECK (deadline_hours > 0 AND deadline_hours <= 720)
);

ALTER TABLE public.onboarding_task_templates
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS deadline_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.onboarding_task_templates
  DROP CONSTRAINT IF EXISTS onboarding_task_templates_priority_check;

ALTER TABLE public.onboarding_task_templates
  ADD CONSTRAINT onboarding_task_templates_priority_check
  CHECK (priority IN ('low', 'medium', 'high'));

ALTER TABLE public.onboarding_task_templates
  DROP CONSTRAINT IF EXISTS onboarding_task_templates_deadline_hours_check;

ALTER TABLE public.onboarding_task_templates
  ADD CONSTRAINT onboarding_task_templates_deadline_hours_check
  CHECK (deadline_hours > 0 AND deadline_hours <= 720);

CREATE INDEX IF NOT EXISTS idx_onboarding_task_templates_active_sort
  ON public.onboarding_task_templates(is_active, sort_order, created_at);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS onboarding_template_id uuid
    REFERENCES public.onboarding_task_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_dedupe_key_unique
  ON public.tasks(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_onboarding_template_active_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.is_active IS TRUE THEN
    SELECT count(*)
      INTO active_count
    FROM public.onboarding_task_templates
    WHERE is_active = true
      AND id IS DISTINCT FROM NEW.id;

    IF active_count >= 4 THEN
      RAISE EXCEPTION 'Chỉ được bật tối đa 4 checklist onboarding mặc định.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_onboarding_templates_active_limit ON public.onboarding_task_templates;
CREATE TRIGGER tr_onboarding_templates_active_limit
  BEFORE INSERT OR UPDATE OF is_active ON public.onboarding_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_onboarding_template_active_limit();

DROP TRIGGER IF EXISTS tr_onboarding_templates_updated ON public.onboarding_task_templates;
CREATE TRIGGER tr_onboarding_templates_updated
  BEFORE UPDATE ON public.onboarding_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.onboarding_task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_templates_admin_manager_select" ON public.onboarding_task_templates;
DROP POLICY IF EXISTS "onboarding_templates_admin_manager_insert" ON public.onboarding_task_templates;
DROP POLICY IF EXISTS "onboarding_templates_admin_manager_update" ON public.onboarding_task_templates;
DROP POLICY IF EXISTS "onboarding_templates_admin_manager_delete" ON public.onboarding_task_templates;

CREATE POLICY "onboarding_templates_admin_manager_select" ON public.onboarding_task_templates
  FOR SELECT TO authenticated
  USING (
    public.has_role('admin'::public.app_role)
    OR public.has_role('manager'::public.app_role)
  );

CREATE POLICY "onboarding_templates_admin_manager_insert" ON public.onboarding_task_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role('admin'::public.app_role)
    OR public.has_role('manager'::public.app_role)
  );

CREATE POLICY "onboarding_templates_admin_manager_update" ON public.onboarding_task_templates
  FOR UPDATE TO authenticated
  USING (
    public.has_role('admin'::public.app_role)
    OR public.has_role('manager'::public.app_role)
  )
  WITH CHECK (
    public.has_role('admin'::public.app_role)
    OR public.has_role('manager'::public.app_role)
  );

CREATE POLICY "onboarding_templates_admin_manager_delete" ON public.onboarding_task_templates
  FOR DELETE TO authenticated
  USING (
    public.has_role('admin'::public.app_role)
    OR public.has_role('manager'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.clone_onboarding_tasks_for_user(
  p_user_id uuid,
  p_team_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role public.app_role;
  v_user_role public.app_role;
  v_team_id uuid := p_team_id;
  v_inserted_count integer := 0;
BEGIN
  SELECT p.id, ur.role
    INTO v_actor_id, v_actor_role
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.auth_user_id = auth.uid()
    AND ur.role IN ('admin'::public.app_role, 'manager'::public.app_role)
  ORDER BY CASE ur.role WHEN 'admin'::public.app_role THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Bạn không có quyền tạo checklist onboarding.';
  END IF;

  SELECT ur.role
    INTO v_user_role
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id
  ORDER BY CASE ur.role WHEN 'employee'::public.app_role THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_user_role IS DISTINCT FROM 'employee'::public.app_role THEN
    RETURN 0;
  END IF;

  IF v_team_id IS NULL THEN
    SELECT tm.team_id
      INTO v_team_id
    FROM public.team_memberships tm
    WHERE tm.user_id = p_user_id
      AND tm.is_active = true
    ORDER BY tm.start_date DESC NULLS LAST, tm.created_at DESC
    LIMIT 1;
  END IF;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Employee cần được gán team trước khi tạo checklist onboarding.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.user_id = p_user_id
      AND tm.team_id = v_team_id
      AND tm.is_active = true
  ) THEN
    RAISE EXCEPTION 'Employee không thuộc team đã chọn.';
  END IF;

  WITH inserted AS (
    INSERT INTO public.tasks (
      team_id,
      assigned_to,
      assigned_by,
      created_by,
      title,
      description,
      deadline,
      task_date,
      priority,
      status,
      onboarding_template_id,
      dedupe_key
    )
    SELECT
      v_team_id,
      p_user_id,
      v_actor_id,
      v_actor_id,
      template.title,
      template.description,
      now() + make_interval(hours => template.deadline_hours),
      current_date,
      template.priority,
      'todo'::public.task_status,
      template.id,
      'onboarding:' || p_user_id::text || ':' || template.id::text
    FROM public.onboarding_task_templates template
    WHERE template.is_active = true
    ORDER BY template.sort_order, template.created_at
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_inserted_count FROM inserted;

  RETURN v_inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_onboarding_tasks_for_user(uuid, uuid) TO authenticated;

INSERT INTO public.onboarding_task_templates (
  title,
  description,
  priority,
  deadline_hours,
  is_active,
  sort_order
)
SELECT seed.title, seed.description, seed.priority, seed.deadline_hours, true, seed.sort_order
FROM (
  VALUES
    (
      'Xây page',
      'Đầy đủ avatar, ảnh bìa, tiểu sử, rõ thông tin hotline, 15 bài post seeding lên page, 3 tin nổi bật, 3 bài ghim.',
      'high',
      24,
      1
    ),
    (
      '3 Intro video (Hook)',
      'Hoàn thiện 3 video intro/hook dùng cho nội dung marketing.',
      'medium',
      24,
      2
    ),
    (
      '1 Đuôi live cắt hoàn chỉnh',
      'Cắt hoàn chỉnh 1 video đuôi live để sử dụng cho vận hành nội dung.',
      'medium',
      24,
      3
    )
) AS seed(title, description, priority, deadline_hours, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.onboarding_task_templates existing
  WHERE lower(existing.title) = lower(seed.title)
);

NOTIFY pgrst, 'reload schema';
