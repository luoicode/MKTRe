DROP POLICY IF EXISTS floating_leads_leader_select_team ON public.floating_leads;

CREATE POLICY floating_leads_leader_select_team ON public.floating_leads
FOR SELECT TO authenticated
USING (
  public.has_role('leader')
  AND public.is_active_user()
  AND (
    created_by = public.get_current_profile_id()
    OR public.user_in_my_team(created_by)
    OR EXISTS (
      SELECT 1
      FROM public.team_memberships creator_membership
      JOIN public.team_memberships leader_membership
        ON leader_membership.team_id = creator_membership.team_id
      WHERE creator_membership.user_id = floating_leads.created_by
        AND creator_membership.is_active = true
        AND leader_membership.user_id = public.get_current_profile_id()
        AND leader_membership.is_active = true
        AND leader_membership.role_in_team = 'leader'::public.team_member_role
    )
  )
);

NOTIFY pgrst, 'reload schema';
