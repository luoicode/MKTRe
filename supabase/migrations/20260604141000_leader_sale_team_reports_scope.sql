-- Allow Leader Sale to read reports and role rows for active Sale members
-- in teams they lead. This keeps team dashboards scoped without opening
-- company-wide Sale data.

CREATE OR REPLACE FUNCTION public.leader_sale_can_select_team_sale(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role('leader_sale'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.team_memberships leader_tm
      JOIN public.team_memberships member_tm
        ON member_tm.team_id = leader_tm.team_id
       AND member_tm.is_active = true
      JOIN public.teams team
        ON team.id = leader_tm.team_id
       AND team.department = 'sale'
      JOIN public.profiles member_profile
        ON member_profile.id = member_tm.user_id
       AND member_profile.status = 'active'::public.user_status
      JOIN public.user_roles member_role
        ON member_role.user_id = member_tm.user_id
       AND member_role.role = 'sale'::public.app_role
      WHERE leader_tm.user_id = public.get_current_profile_id()
        AND leader_tm.role_in_team = 'leader'
        AND leader_tm.is_active = true
        AND member_tm.user_id = _profile_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.leader_sale_can_select_team_sale(uuid) TO authenticated;

DROP POLICY IF EXISTS sale_reports_leader_sale_select_team ON public.sale_reports;
CREATE POLICY sale_reports_leader_sale_select_team
ON public.sale_reports
FOR SELECT
TO authenticated
USING (public.leader_sale_can_select_team_sale(user_id));

DROP POLICY IF EXISTS user_roles_leader_sale_select_team ON public.user_roles;
CREATE POLICY user_roles_leader_sale_select_team
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.leader_sale_can_select_team_sale(user_id));

NOTIFY pgrst, 'reload schema';
