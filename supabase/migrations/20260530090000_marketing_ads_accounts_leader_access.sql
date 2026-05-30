CREATE OR REPLACE FUNCTION public.can_select_marketing_ads_account(_ads_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_active_user()
    AND (
      public.has_role('employee'::public.app_role)
      OR public.has_role('leader'::public.app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.marketing_ads_account_assignments assignment
      JOIN public.marketing_ads_accounts account
        ON account.id = assignment.ads_account_id
       AND account.is_active = true
      WHERE assignment.ads_account_id = _ads_account_id
        AND assignment.employee_id = public.get_current_profile_id()
    );
$$;

DROP POLICY IF EXISTS marketing_ads_account_assignments_employee_select_own
  ON public.marketing_ads_account_assignments;
DROP POLICY IF EXISTS marketing_ads_account_assignments_marketing_select_own
  ON public.marketing_ads_account_assignments;
CREATE POLICY marketing_ads_account_assignments_marketing_select_own
ON public.marketing_ads_account_assignments
FOR SELECT
TO authenticated
USING (
  public.is_active_user()
  AND (
    public.has_role('employee'::public.app_role)
    OR public.has_role('leader'::public.app_role)
  )
  AND employee_id = public.get_current_profile_id()
);

NOTIFY pgrst, 'reload schema';
