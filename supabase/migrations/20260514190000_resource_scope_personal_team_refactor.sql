-- Refactor resources into one scoped model:
-- common admin resources, team resources, and personal resources.

ALTER TABLE public.resource_items
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS resource_scope text DEFAULT 'team',
  ADD COLUMN IF NOT EXISTS target_team_id uuid,
  ADD COLUMN IF NOT EXISTS target_user_id uuid;

UPDATE public.resource_items
SET title = COALESCE(title, name)
WHERE title IS NULL;

UPDATE public.resource_items
SET target_team_id = COALESCE(target_team_id, team_id)
WHERE target_team_id IS NULL
  AND team_id IS NOT NULL;

UPDATE public.resource_items
SET resource_scope = CASE
  WHEN target_user_id IS NOT NULL THEN 'personal'
  ELSE 'team'
END
WHERE resource_scope IS NULL
   OR resource_scope NOT IN ('team', 'personal');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.resource_items'::regclass
      AND conname = 'resource_items_scope_check'
  ) THEN
    ALTER TABLE public.resource_items
      ADD CONSTRAINT resource_items_scope_check
      CHECK (resource_scope IN ('team', 'personal')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.resource_items'::regclass
      AND conname = 'resource_items_target_team_id_fkey'
  ) THEN
    ALTER TABLE public.resource_items
      ADD CONSTRAINT resource_items_target_team_id_fkey
      FOREIGN KEY (target_team_id) REFERENCES public.teams(id)
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.resource_items'::regclass
      AND conname = 'resource_items_target_user_id_fkey'
  ) THEN
    ALTER TABLE public.resource_items
      ADD CONSTRAINT resource_items_target_user_id_fkey
      FOREIGN KEY (target_user_id) REFERENCES public.profiles(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_resource_items_target_team
  ON public.resource_items(target_team_id);
CREATE INDEX IF NOT EXISTS idx_resource_items_target_user
  ON public.resource_items(target_user_id);
CREATE INDEX IF NOT EXISTS idx_resource_items_scope
  ON public.resource_items(resource_scope);

DROP POLICY IF EXISTS "resource_items_select" ON public.resource_items;
CREATE POLICY "resource_items_select" ON public.resource_items
  FOR SELECT TO authenticated
  USING (
    (target_team_id IS NULL AND target_user_id IS NULL AND team_id IS NULL)
    OR target_user_id = public.get_current_profile_id()
    OR (target_team_id IS NOT NULL AND public.can_view_team(target_team_id))
    OR (team_id IS NOT NULL AND public.can_view_team(team_id))
  );

DROP POLICY IF EXISTS "resource_items_admin_all" ON public.resource_items;
CREATE POLICY "resource_items_admin_all" ON public.resource_items
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (public.has_role('admin'::app_role));

DROP POLICY IF EXISTS "resource_items_manager_write" ON public.resource_items;
CREATE POLICY "resource_items_manager_write" ON public.resource_items
  FOR ALL TO authenticated
  USING (
    created_by = public.get_current_profile_id()
    AND (
      (resource_scope = 'team' AND target_team_id IS NOT NULL AND public.can_manage_team_kpi(target_team_id))
      OR (
        resource_scope = 'personal'
        AND target_user_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.team_memberships tm
          WHERE tm.user_id = resource_items.target_user_id
            AND tm.is_active = true
            AND public.can_manage_team_kpi(tm.team_id)
        )
      )
    )
  )
  WITH CHECK (
    created_by = public.get_current_profile_id()
    AND (
      (resource_scope = 'team' AND target_team_id IS NOT NULL AND public.can_manage_team_kpi(target_team_id))
      OR (
        resource_scope = 'personal'
        AND target_user_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.team_memberships tm
          WHERE tm.user_id = resource_items.target_user_id
            AND tm.is_active = true
            AND public.can_manage_team_kpi(tm.team_id)
        )
      )
    )
  );

NOTIFY pgrst, 'reload schema';
