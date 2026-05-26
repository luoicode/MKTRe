-- Leader Sale uses the same operational floating-lead pool as Sale.
-- The previous team-scoped select policy hid unassigned leads because those rows
-- have no assigned_sale_id yet, so the common pool appeared empty for leaders.
DROP POLICY IF EXISTS floating_leads_sale_select_all ON public.floating_leads;

CREATE POLICY floating_leads_sale_select_all ON public.floating_leads
FOR SELECT TO authenticated
USING (
  public.is_active_user()
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
);

NOTIFY pgrst, 'reload schema';
