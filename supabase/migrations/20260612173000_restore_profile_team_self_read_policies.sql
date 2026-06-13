-- Hotfix: restore mandatory self-read RLS paths used during login/profile bootstrap.
-- This migration is additive. It does not remove or replace the CRM V2 Sale
-- marketer metadata policies added in 20260612172000.

DROP POLICY IF EXISTS profiles_authenticated_read_own_profile_hotfix ON public.profiles;
CREATE POLICY profiles_authenticated_read_own_profile_hotfix
ON public.profiles
FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS team_memberships_authenticated_read_own_hotfix ON public.team_memberships;
CREATE POLICY team_memberships_authenticated_read_own_hotfix
ON public.team_memberships
FOR SELECT
TO authenticated
USING (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS teams_authenticated_read_own_team_hotfix ON public.teams;
CREATE POLICY teams_authenticated_read_own_team_hotfix
ON public.teams
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.team_memberships membership
    WHERE membership.team_id = teams.id
      AND membership.user_id = public.get_current_profile_id()
      AND membership.is_active = true
  )
);

-- Verify after applying:
-- select id, full_name, auth_user_id
-- from public.profiles
-- where auth_user_id = auth.uid();
--
-- select *
-- from public.team_memberships
-- where user_id = public.get_current_profile_id();
