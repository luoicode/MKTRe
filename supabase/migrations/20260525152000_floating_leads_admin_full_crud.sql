DROP POLICY IF EXISTS floating_leads_admin_manager_all ON public.floating_leads;

CREATE POLICY floating_leads_admin_manager_all ON public.floating_leads
FOR ALL TO authenticated
USING (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
)
WITH CHECK (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
);

NOTIFY pgrst, 'reload schema';
