CREATE TABLE IF NOT EXISTS public.sale_kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_type public.kpi_period NOT NULL DEFAULT 'month',
  period_start date NOT NULL,
  period_end date NOT NULL,
  revenue_target numeric NOT NULL DEFAULT 0,
  orders_target integer NOT NULL DEFAULT 0,
  close_rate_target numeric NOT NULL DEFAULT 0,
  average_order_target numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_kpi_targets_scope_check CHECK (team_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_sale_kpi_targets_team_period
  ON public.sale_kpi_targets(team_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_sale_kpi_targets_user_period
  ON public.sale_kpi_targets(user_id, period_start, period_end);

CREATE TRIGGER tr_sale_kpi_targets_set_updated_at
  BEFORE UPDATE ON public.sale_kpi_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sale_kpi_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_kpi_targets_admin_manager_select ON public.sale_kpi_targets;
CREATE POLICY sale_kpi_targets_admin_manager_select
  ON public.sale_kpi_targets
  FOR SELECT
  TO authenticated
  USING (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role));

DROP POLICY IF EXISTS sale_kpi_targets_sale_self_select ON public.sale_kpi_targets;
CREATE POLICY sale_kpi_targets_sale_self_select
  ON public.sale_kpi_targets
  FOR SELECT
  TO authenticated
  USING (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS sale_kpi_targets_leader_team_select ON public.sale_kpi_targets;
CREATE POLICY sale_kpi_targets_leader_team_select
  ON public.sale_kpi_targets
  FOR SELECT
  TO authenticated
  USING (
    public.has_role('leader_sale'::public.app_role)
    AND (
      EXISTS (
        SELECT 1
        FROM public.team_memberships leader_memberships
        WHERE leader_memberships.team_id = sale_kpi_targets.team_id
          AND leader_memberships.user_id = public.get_current_profile_id()
          AND leader_memberships.role_in_team = 'leader'
          AND leader_memberships.is_active = true
      )
      OR EXISTS (
        SELECT 1
        FROM public.team_memberships member_memberships
        JOIN public.team_memberships leader_memberships
          ON leader_memberships.team_id = member_memberships.team_id
        WHERE member_memberships.user_id = sale_kpi_targets.user_id
          AND member_memberships.is_active = true
          AND leader_memberships.user_id = public.get_current_profile_id()
          AND leader_memberships.role_in_team = 'leader'
          AND leader_memberships.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS sale_kpi_targets_admin_manager_insert ON public.sale_kpi_targets;
CREATE POLICY sale_kpi_targets_admin_manager_insert
  ON public.sale_kpi_targets
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role));

DROP POLICY IF EXISTS sale_kpi_targets_admin_manager_update ON public.sale_kpi_targets;
CREATE POLICY sale_kpi_targets_admin_manager_update
  ON public.sale_kpi_targets
  FOR UPDATE
  TO authenticated
  USING (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role))
  WITH CHECK (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role));

DROP POLICY IF EXISTS sale_kpi_targets_admin_manager_delete ON public.sale_kpi_targets;
CREATE POLICY sale_kpi_targets_admin_manager_delete
  ON public.sale_kpi_targets
  FOR DELETE
  TO authenticated
  USING (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role));

NOTIFY pgrst, 'reload schema';
