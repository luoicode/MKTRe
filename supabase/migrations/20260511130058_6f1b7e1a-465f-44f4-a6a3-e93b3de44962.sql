-- manager_team_assignments table
CREATE TABLE IF NOT EXISTS public.manager_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL,
  team_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manager_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_mta_manager ON public.manager_team_assignments(manager_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_mta_team ON public.manager_team_assignments(team_id) WHERE is_active = true;

ALTER TABLE public.manager_team_assignments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tr_mta_set_updated ON public.manager_team_assignments;
CREATE TRIGGER tr_mta_set_updated
  BEFORE UPDATE ON public.manager_team_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_marketing_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role('marketing_manager'::app_role);
$$;

CREATE OR REPLACE FUNCTION public.manager_leads_team(_team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.manager_team_assignments mta
    JOIN public.profiles p ON p.id = mta.manager_id
    WHERE mta.team_id = _team_id
      AND mta.is_active = true
      AND p.auth_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.manager_leads_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    JOIN public.manager_team_assignments mta ON mta.team_id = tm.team_id AND mta.is_active = true
    JOIN public.profiles p ON p.id = mta.manager_id
    WHERE tm.user_id = _user_id
      AND tm.is_active = true
      AND p.auth_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_team(_team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role('admin'::app_role)
    OR public.leads_team(_team_id)
    OR public.manager_leads_team(_team_id)
    OR EXISTS (
      SELECT 1 FROM public.team_memberships tm
      WHERE tm.team_id = _team_id
        AND tm.user_id = public.get_current_profile_id()
        AND tm.is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role('admin'::app_role)
    OR _user_id = public.get_current_profile_id()
    OR public.user_in_my_team(_user_id)
    OR public.manager_leads_user(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_team_kpi(_team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role('admin'::app_role)
    OR public.leads_team(_team_id)
    OR public.manager_leads_team(_team_id);
$$;

-- RLS for manager_team_assignments
DROP POLICY IF EXISTS mta_admin_all ON public.manager_team_assignments;
CREATE POLICY mta_admin_all ON public.manager_team_assignments
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (public.has_role('admin'::app_role));

DROP POLICY IF EXISTS mta_manager_self_select ON public.manager_team_assignments;
CREATE POLICY mta_manager_self_select ON public.manager_team_assignments
  FOR SELECT TO authenticated
  USING (manager_id = public.get_current_profile_id());

-- Extend RLS for marketing_manager scope
DROP POLICY IF EXISTS teams_manager_select ON public.teams;
CREATE POLICY teams_manager_select ON public.teams
  FOR SELECT TO authenticated
  USING (public.manager_leads_team(id));

DROP POLICY IF EXISTS profiles_manager_select_assigned ON public.profiles;
CREATE POLICY profiles_manager_select_assigned ON public.profiles
  FOR SELECT TO authenticated
  USING (public.manager_leads_user(id));

DROP POLICY IF EXISTS tm_manager_select ON public.team_memberships;
CREATE POLICY tm_manager_select ON public.team_memberships
  FOR SELECT TO authenticated
  USING (public.manager_leads_team(team_id));

DROP POLICY IF EXISTS reports_manager_select_assigned ON public.slot_reports;
CREATE POLICY reports_manager_select_assigned ON public.slot_reports
  FOR SELECT TO authenticated
  USING (public.manager_leads_user(user_id) OR public.manager_leads_team(team_id));

DROP POLICY IF EXISTS kpi_manager_select_assigned ON public.kpi_targets;
CREATE POLICY kpi_manager_select_assigned ON public.kpi_targets
  FOR SELECT TO authenticated
  USING (
    (team_id IS NOT NULL AND public.manager_leads_team(team_id))
    OR (user_id IS NOT NULL AND public.manager_leads_user(user_id))
  );
