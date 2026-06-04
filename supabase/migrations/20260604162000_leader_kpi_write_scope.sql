-- Allow Leader Sale to manage KPI targets only for the Sale team they lead.
-- Marketing leader write policies already use can_manage_team_kpi(team_id).

CREATE OR REPLACE FUNCTION public.leader_sale_can_manage_kpi_target(
  _team_id uuid,
  _user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role('leader_sale'::public.app_role)
    AND (
      (
        _user_id IS NULL
        AND _team_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.team_memberships leader_tm
          JOIN public.teams t ON t.id = leader_tm.team_id
          WHERE leader_tm.user_id = public.get_current_profile_id()
            AND leader_tm.team_id = _team_id
            AND leader_tm.role_in_team = 'leader'
            AND leader_tm.is_active = true
            AND t.department = 'sale'
        )
      )
      OR (
        _user_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.team_memberships member_tm
          JOIN public.team_memberships leader_tm
            ON leader_tm.team_id = member_tm.team_id
          JOIN public.teams t ON t.id = member_tm.team_id
          JOIN public.profiles p ON p.id = member_tm.user_id
          JOIN public.user_roles ur ON ur.user_id = member_tm.user_id
          WHERE member_tm.user_id = _user_id
            AND member_tm.is_active = true
            AND leader_tm.user_id = public.get_current_profile_id()
            AND leader_tm.role_in_team = 'leader'
            AND leader_tm.is_active = true
            AND t.department = 'sale'
            AND p.status = 'active'
            AND ur.role = 'sale'::public.app_role
            AND (_team_id IS NULL OR _team_id = member_tm.team_id)
        )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.leader_sale_can_manage_kpi_target(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS sale_kpi_targets_leader_team_insert ON public.sale_kpi_targets;
CREATE POLICY sale_kpi_targets_leader_team_insert
  ON public.sale_kpi_targets
  FOR INSERT
  TO authenticated
  WITH CHECK (public.leader_sale_can_manage_kpi_target(team_id, user_id));

DROP POLICY IF EXISTS sale_kpi_targets_leader_team_update ON public.sale_kpi_targets;
CREATE POLICY sale_kpi_targets_leader_team_update
  ON public.sale_kpi_targets
  FOR UPDATE
  TO authenticated
  USING (public.leader_sale_can_manage_kpi_target(team_id, user_id))
  WITH CHECK (public.leader_sale_can_manage_kpi_target(team_id, user_id));

DROP POLICY IF EXISTS sale_kpi_targets_leader_team_delete ON public.sale_kpi_targets;
CREATE POLICY sale_kpi_targets_leader_team_delete
  ON public.sale_kpi_targets
  FOR DELETE
  TO authenticated
  USING (public.leader_sale_can_manage_kpi_target(team_id, user_id));

NOTIFY pgrst, 'reload schema';
