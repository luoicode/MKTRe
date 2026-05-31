-- Fix Leader Marketing report/team scope when leadership is stored in team_memberships.
-- Older helpers only checked teams.leader_id, so leader pages could see the team
-- shell but not member profiles/roles/reports.

CREATE OR REPLACE FUNCTION public.leads_team(_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teams t
    JOIN public.profiles p ON p.id = t.leader_id
    WHERE t.id = _team_id
      AND p.auth_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.team_memberships leader_tm
    WHERE leader_tm.team_id = _team_id
      AND leader_tm.user_id = public.get_current_profile_id()
      AND leader_tm.role_in_team = 'leader'
      AND leader_tm.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.user_in_my_team(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships member_tm
    JOIN public.teams t ON t.id = member_tm.team_id
    JOIN public.profiles leader_profile ON leader_profile.id = t.leader_id
    WHERE member_tm.user_id = _user_id
      AND member_tm.is_active = true
      AND leader_profile.auth_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.team_memberships leader_tm
    JOIN public.team_memberships member_tm
      ON member_tm.team_id = leader_tm.team_id
     AND member_tm.is_active = true
    WHERE leader_tm.user_id = public.get_current_profile_id()
      AND leader_tm.role_in_team = 'leader'
      AND leader_tm.is_active = true
      AND member_tm.user_id = _user_id
  );
$$;

DROP POLICY IF EXISTS user_roles_leader_select_team ON public.user_roles;
CREATE POLICY user_roles_leader_select_team
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.has_role('leader'::public.app_role)
  AND public.user_in_my_team(user_id)
);

NOTIFY pgrst, 'reload schema';
