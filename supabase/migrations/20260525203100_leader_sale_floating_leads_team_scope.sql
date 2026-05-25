DROP POLICY IF EXISTS floating_leads_sale_select_all ON public.floating_leads;
CREATE POLICY floating_leads_sale_select_all ON public.floating_leads
FOR SELECT TO authenticated
USING (
  (
    public.has_role('sale'::public.app_role)
    AND public.is_active_user()
  )
  OR (
    public.has_role('leader_sale'::public.app_role)
    AND public.is_active_user()
    AND (
      assigned_sale_id IN (
        SELECT member.user_id
        FROM public.team_memberships leader_membership
        JOIN public.team_memberships member
          ON member.team_id = leader_membership.team_id
         AND member.is_active = true
        JOIN public.teams team
          ON team.id = leader_membership.team_id
         AND team.department = 'sale'
        WHERE leader_membership.user_id = public.get_current_profile_id()
          AND leader_membership.role_in_team = 'leader'
          AND leader_membership.is_active = true
      )
      OR closed_by IN (
        SELECT member.user_id
        FROM public.team_memberships leader_membership
        JOIN public.team_memberships member
          ON member.team_id = leader_membership.team_id
         AND member.is_active = true
        JOIN public.teams team
          ON team.id = leader_membership.team_id
         AND team.department = 'sale'
        WHERE leader_membership.user_id = public.get_current_profile_id()
          AND leader_membership.role_in_team = 'leader'
          AND leader_membership.is_active = true
      )
      OR EXISTS (
        SELECT 1
        FROM public.team_memberships leader_membership
        JOIN public.team_memberships member
          ON member.team_id = leader_membership.team_id
         AND member.is_active = true
        JOIN public.teams team
          ON team.id = leader_membership.team_id
         AND team.department = 'sale'
        WHERE leader_membership.user_id = public.get_current_profile_id()
          AND leader_membership.role_in_team = 'leader'
          AND leader_membership.is_active = true
          AND member.user_id = ANY(floating_leads.blocked_sale_ids)
      )
    )
  )
);

NOTIFY pgrst, 'reload schema';
