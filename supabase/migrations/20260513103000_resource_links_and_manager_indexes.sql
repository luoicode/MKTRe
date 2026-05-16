-- Dedicated resource_links table requested by the product spec.

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

CREATE INDEX IF NOT EXISTS idx_resource_links_team ON public.resource_links(team_id);

ALTER TABLE public.resource_links ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tr_resource_links_updated ON public.resource_links;
CREATE TRIGGER tr_resource_links_updated
  BEFORE UPDATE ON public.resource_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "resource_links_select" ON public.resource_links
  FOR SELECT TO authenticated
  USING (team_id IS NULL OR public.can_view_team(team_id));

CREATE POLICY "resource_links_admin_all" ON public.resource_links
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (public.has_role('admin'::app_role));

CREATE POLICY "resource_links_manager_write" ON public.resource_links
  FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND public.can_manage_team_kpi(team_id))
  WITH CHECK (team_id IS NOT NULL AND public.can_manage_team_kpi(team_id));

CREATE INDEX IF NOT EXISTS idx_slot_reports_user_date_status
  ON public.slot_reports(user_id, report_date, status);

CREATE INDEX IF NOT EXISTS idx_tasks_status_date
  ON public.tasks(status, task_date);
