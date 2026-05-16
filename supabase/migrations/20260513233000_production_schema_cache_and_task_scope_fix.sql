-- Production hardening for Phase 8 schema cache issues and task assignment scope.
-- Safe to run more than once in Supabase SQL Editor.

DO $$
BEGIN
  CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.kpi_targets
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS custom_label text,
  ADD COLUMN IF NOT EXISTS custom_target numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  task_date date NOT NULL DEFAULT CURRENT_DATE,
  deadline timestamptz,
  status public.task_status NOT NULL DEFAULT 'todo',
  completion_note text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS deadline timestamptz,
  ADD COLUMN IF NOT EXISTS status public.task_status DEFAULT 'todo',
  ADD COLUMN IF NOT EXISTS completion_note text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.daily_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_task_templates
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.daily_task_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completion_date date NOT NULL DEFAULT CURRENT_DATE,
  completed boolean NOT NULL DEFAULT false,
  note text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, user_id, completion_date)
);

ALTER TABLE public.task_completions
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.daily_task_templates(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS completion_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  kind text NOT NULL DEFAULT 'news',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_scope text NOT NULL DEFAULT 'all' CHECK (target_scope IN ('all', 'team', 'user')),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS kind text DEFAULT 'news',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_scope text DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.notification_reads (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(notification_id, user_id)
);

ALTER TABLE public.notification_reads
  ADD COLUMN IF NOT EXISTS notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS read_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.intro_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL UNIQUE,
  title text NOT NULL,
  content text,
  link_url text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.intro_sections
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS section_key text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.resource_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  note text,
  is_provided boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resource_links
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS is_provided boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.resource_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text,
  link_url text,
  note text,
  is_provided boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resource_items
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS is_provided boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_completions_unique
  ON public.task_completions(template_id, user_id, completion_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_intro_sections_section_key
  ON public.intro_sections(section_key);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_date ON public.tasks(assigned_to, task_date DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_team_date ON public.tasks(team_id, task_date DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status_date ON public.tasks(status, task_date);
CREATE INDEX IF NOT EXISTS idx_daily_templates_team ON public.daily_task_templates(team_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_resource_links_team ON public.resource_links(team_id);
CREATE INDEX IF NOT EXISTS idx_resource_items_team ON public.resource_items(team_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tasks'::regclass AND conname = 'tasks_assigned_to_fkey'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to)
      REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tasks'::regclass AND conname = 'tasks_assigned_by_fkey'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_assigned_by_fkey FOREIGN KEY (assigned_by)
      REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tasks'::regclass AND conname = 'tasks_team_id_fkey'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_team_id_fkey FOREIGN KEY (team_id)
      REFERENCES public.teams(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.user_active_member_of_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.user_id = _user_id
      AND tm.team_id = _team_id
      AND tm.is_active = true
      AND tm.role_in_team = 'employee'::public.team_member_role
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_task_assignee_team_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
  THEN
    IF NEW.team_id IS NULL THEN
      RAISE EXCEPTION 'Task must belong to a team';
    END IF;

    IF NOT public.user_active_member_of_team(NEW.assigned_to, NEW.team_id) THEN
      RAISE EXCEPTION 'Task assignee must be an active employee member of the selected team';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_items ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tr_tasks_assignee_team_guard ON public.tasks;
CREATE TRIGGER tr_tasks_assignee_team_guard
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_task_assignee_team_membership();

DROP TRIGGER IF EXISTS tr_tasks_updated ON public.tasks;
CREATE TRIGGER tr_tasks_updated
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tr_daily_templates_updated ON public.daily_task_templates;
CREATE TRIGGER tr_daily_templates_updated
  BEFORE UPDATE ON public.daily_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tr_task_completions_updated ON public.task_completions;
CREATE TRIGGER tr_task_completions_updated
  BEFORE UPDATE ON public.task_completions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tr_resource_links_updated ON public.resource_links;
CREATE TRIGGER tr_resource_links_updated
  BEFORE UPDATE ON public.resource_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tr_resource_items_updated ON public.resource_items;
CREATE TRIGGER tr_resource_items_updated
  BEFORE UPDATE ON public.resource_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tr_intro_sections_updated ON public.intro_sections;
CREATE TRIGGER tr_intro_sections_updated
  BEFORE UPDATE ON public.intro_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "tasks_admin_all" ON public.tasks;
CREATE POLICY "tasks_admin_all" ON public.tasks
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (
    public.has_role('admin'::app_role)
    AND (
      team_id IS NULL
      OR public.user_active_member_of_team(assigned_to, team_id)
    )
  );

DROP POLICY IF EXISTS "tasks_employee_select" ON public.tasks;
CREATE POLICY "tasks_employee_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (assigned_to = public.get_current_profile_id());

DROP POLICY IF EXISTS "tasks_employee_update" ON public.tasks;
CREATE POLICY "tasks_employee_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (assigned_to = public.get_current_profile_id())
  WITH CHECK (assigned_to = public.get_current_profile_id());

DROP POLICY IF EXISTS "tasks_leader_manager_select" ON public.tasks;
CREATE POLICY "tasks_leader_manager_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    (team_id IS NOT NULL AND public.can_view_team(team_id))
    OR public.can_view_user(assigned_to)
  );

DROP POLICY IF EXISTS "tasks_leader_manager_write" ON public.tasks;
CREATE POLICY "tasks_leader_manager_write" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    team_id IS NOT NULL
    AND public.can_manage_team_kpi(team_id)
    AND public.user_active_member_of_team(assigned_to, team_id)
  );

DROP POLICY IF EXISTS "tasks_leader_manager_update" ON public.tasks;
CREATE POLICY "tasks_leader_manager_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (team_id IS NOT NULL AND public.can_manage_team_kpi(team_id))
  WITH CHECK (
    team_id IS NOT NULL
    AND public.can_manage_team_kpi(team_id)
    AND public.user_active_member_of_team(assigned_to, team_id)
  );

DROP POLICY IF EXISTS "tasks_leader_manager_delete" ON public.tasks;
CREATE POLICY "tasks_leader_manager_delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (team_id IS NOT NULL AND public.can_manage_team_kpi(team_id));

DROP POLICY IF EXISTS "daily_templates_select" ON public.daily_task_templates;
CREATE POLICY "daily_templates_select" ON public.daily_task_templates
  FOR SELECT TO authenticated
  USING (team_id IS NULL OR public.can_view_team(team_id));

DROP POLICY IF EXISTS "daily_templates_admin_all" ON public.daily_task_templates;
CREATE POLICY "daily_templates_admin_all" ON public.daily_task_templates
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (public.has_role('admin'::app_role));

DROP POLICY IF EXISTS "daily_templates_manager_write" ON public.daily_task_templates;
CREATE POLICY "daily_templates_manager_write" ON public.daily_task_templates
  FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND public.can_manage_team_kpi(team_id))
  WITH CHECK (team_id IS NOT NULL AND public.can_manage_team_kpi(team_id));

DROP POLICY IF EXISTS "task_completions_self_all" ON public.task_completions;
CREATE POLICY "task_completions_self_all" ON public.task_completions
  FOR ALL TO authenticated
  USING (user_id = public.get_current_profile_id())
  WITH CHECK (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "task_completions_manager_select" ON public.task_completions;
CREATE POLICY "task_completions_manager_select" ON public.task_completions
  FOR SELECT TO authenticated
  USING (public.can_view_user(user_id));

DROP POLICY IF EXISTS "notifications_select_targeted" ON public.notifications;
CREATE POLICY "notifications_select_targeted" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    target_scope = 'all'
    OR (target_scope = 'user' AND user_id = public.get_current_profile_id())
    OR (target_scope = 'team' AND team_id IS NOT NULL AND public.can_view_team(team_id))
  );

DROP POLICY IF EXISTS "notifications_admin_all" ON public.notifications;
CREATE POLICY "notifications_admin_all" ON public.notifications
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (public.has_role('admin'::app_role));

DROP POLICY IF EXISTS "notifications_manager_insert" ON public.notifications;
CREATE POLICY "notifications_manager_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role('admin'::app_role)
    OR (
      public.is_manager()
      AND target_scope = 'all'
      AND team_id IS NULL
      AND user_id IS NULL
    )
    OR (
      public.is_manager()
      AND target_scope = 'team'
      AND team_id IS NOT NULL
      AND public.can_manage_team_kpi(team_id)
      AND user_id IS NULL
    )
  );

DROP POLICY IF EXISTS "notification_reads_self_all" ON public.notification_reads;
CREATE POLICY "notification_reads_self_all" ON public.notification_reads
  FOR ALL TO authenticated
  USING (user_id = public.get_current_profile_id())
  WITH CHECK (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "intro_sections_select" ON public.intro_sections;
CREATE POLICY "intro_sections_select" ON public.intro_sections
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "intro_sections_admin_manager_all" ON public.intro_sections;
CREATE POLICY "intro_sections_admin_manager_all" ON public.intro_sections
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role) OR public.is_manager())
  WITH CHECK (public.has_role('admin'::app_role) OR public.is_manager());

DROP POLICY IF EXISTS "resource_links_select" ON public.resource_links;
CREATE POLICY "resource_links_select" ON public.resource_links
  FOR SELECT TO authenticated
  USING (team_id IS NULL OR public.can_view_team(team_id));

DROP POLICY IF EXISTS "resource_links_admin_all" ON public.resource_links;
CREATE POLICY "resource_links_admin_all" ON public.resource_links
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (public.has_role('admin'::app_role));

DROP POLICY IF EXISTS "resource_links_manager_write" ON public.resource_links;
CREATE POLICY "resource_links_manager_write" ON public.resource_links
  FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND public.can_manage_team_kpi(team_id))
  WITH CHECK (team_id IS NOT NULL AND public.can_manage_team_kpi(team_id));

DROP POLICY IF EXISTS "resource_items_select" ON public.resource_items;
CREATE POLICY "resource_items_select" ON public.resource_items
  FOR SELECT TO authenticated
  USING (team_id IS NULL OR public.can_view_team(team_id));

DROP POLICY IF EXISTS "resource_items_admin_all" ON public.resource_items;
CREATE POLICY "resource_items_admin_all" ON public.resource_items
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (public.has_role('admin'::app_role));

DROP POLICY IF EXISTS "resource_items_manager_write" ON public.resource_items;
CREATE POLICY "resource_items_manager_write" ON public.resource_items
  FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND public.can_manage_team_kpi(team_id))
  WITH CHECK (team_id IS NOT NULL AND public.can_manage_team_kpi(team_id));

NOTIFY pgrst, 'reload schema';
