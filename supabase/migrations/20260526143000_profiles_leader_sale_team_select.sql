CREATE OR REPLACE FUNCTION public.leader_sale_can_select_team_profile(_profile_id uuid)
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
      WHERE leader_tm.user_id = public.get_current_profile_id()
        AND leader_tm.role_in_team = 'leader'
        AND leader_tm.is_active = true
        AND member_tm.user_id = _profile_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.leader_sale_can_select_team_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS profiles_leader_sale_select_team ON public.profiles;
CREATE POLICY profiles_leader_sale_select_team
ON public.profiles
FOR SELECT
TO authenticated
USING (public.leader_sale_can_select_team_profile(id));

DROP POLICY IF EXISTS profiles_manager_select_all ON public.profiles;
CREATE POLICY profiles_manager_select_all
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role('manager'::public.app_role));
