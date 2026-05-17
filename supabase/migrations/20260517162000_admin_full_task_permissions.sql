-- Grant Admin full task/checklist control without relaxing employee/leader scopes.

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_admin_all" ON public.tasks;
DROP POLICY IF EXISTS "tasks_admin_select_all" ON public.tasks;
DROP POLICY IF EXISTS "tasks_admin_insert_all" ON public.tasks;
DROP POLICY IF EXISTS "tasks_admin_update_all" ON public.tasks;
DROP POLICY IF EXISTS "tasks_admin_delete_all" ON public.tasks;

CREATE POLICY "tasks_admin_select_all" ON public.tasks
  FOR SELECT TO authenticated
  USING (public.has_role('admin'::public.app_role));

CREATE POLICY "tasks_admin_insert_all" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role('admin'::public.app_role));

CREATE POLICY "tasks_admin_update_all" ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.has_role('admin'::public.app_role))
  WITH CHECK (public.has_role('admin'::public.app_role));

CREATE POLICY "tasks_admin_delete_all" ON public.tasks
  FOR DELETE TO authenticated
  USING (public.has_role('admin'::public.app_role));

ALTER TABLE public.daily_task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_templates_admin_all" ON public.daily_task_templates;
DROP POLICY IF EXISTS "daily_templates_admin_select_all" ON public.daily_task_templates;
DROP POLICY IF EXISTS "daily_templates_admin_insert_all" ON public.daily_task_templates;
DROP POLICY IF EXISTS "daily_templates_admin_update_all" ON public.daily_task_templates;
DROP POLICY IF EXISTS "daily_templates_admin_delete_all" ON public.daily_task_templates;

CREATE POLICY "daily_templates_admin_select_all" ON public.daily_task_templates
  FOR SELECT TO authenticated
  USING (public.has_role('admin'::public.app_role));

CREATE POLICY "daily_templates_admin_insert_all" ON public.daily_task_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role('admin'::public.app_role));

CREATE POLICY "daily_templates_admin_update_all" ON public.daily_task_templates
  FOR UPDATE TO authenticated
  USING (public.has_role('admin'::public.app_role))
  WITH CHECK (public.has_role('admin'::public.app_role));

CREATE POLICY "daily_templates_admin_delete_all" ON public.daily_task_templates
  FOR DELETE TO authenticated
  USING (public.has_role('admin'::public.app_role));

ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_completions_admin_all" ON public.task_completions;
DROP POLICY IF EXISTS "task_completions_admin_select_all" ON public.task_completions;
DROP POLICY IF EXISTS "task_completions_admin_insert_all" ON public.task_completions;
DROP POLICY IF EXISTS "task_completions_admin_update_all" ON public.task_completions;
DROP POLICY IF EXISTS "task_completions_admin_delete_all" ON public.task_completions;

CREATE POLICY "task_completions_admin_select_all" ON public.task_completions
  FOR SELECT TO authenticated
  USING (public.has_role('admin'::public.app_role));

CREATE POLICY "task_completions_admin_insert_all" ON public.task_completions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role('admin'::public.app_role));

CREATE POLICY "task_completions_admin_update_all" ON public.task_completions
  FOR UPDATE TO authenticated
  USING (public.has_role('admin'::public.app_role))
  WITH CHECK (public.has_role('admin'::public.app_role));

CREATE POLICY "task_completions_admin_delete_all" ON public.task_completions
  FOR DELETE TO authenticated
  USING (public.has_role('admin'::public.app_role));

DO $$
DECLARE
  task_table text;
BEGIN
  FOREACH task_table IN ARRAY ARRAY[
    'checklist_tasks',
    'task_comments',
    'subtasks',
    'checklist_items'
  ]
  LOOP
    IF to_regclass(format('public.%I', task_table)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', task_table);

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', task_table || '_admin_all', task_table);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', task_table || '_admin_select_all', task_table);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', task_table || '_admin_insert_all', task_table);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', task_table || '_admin_update_all', task_table);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', task_table || '_admin_delete_all', task_table);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_role(''admin''::public.app_role))',
        task_table || '_admin_select_all',
        task_table
      );

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(''admin''::public.app_role))',
        task_table || '_admin_insert_all',
        task_table
      );

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_role(''admin''::public.app_role)) WITH CHECK (public.has_role(''admin''::public.app_role))',
        task_table || '_admin_update_all',
        task_table
      );

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_role(''admin''::public.app_role))',
        task_table || '_admin_delete_all',
        task_table
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
