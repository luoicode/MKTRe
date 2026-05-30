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
      public.has_role('admin'::public.app_role)
      OR public.has_role('employee'::public.app_role)
      OR public.has_role('leader'::public.app_role)
    )
    AND (
      public.has_role('admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.marketing_ads_account_assignments assignment
        JOIN public.marketing_ads_accounts account
          ON account.id = assignment.ads_account_id
         AND account.is_active = true
        WHERE assignment.ads_account_id = _ads_account_id
          AND assignment.employee_id = public.get_current_profile_id()
      )
    );
$$;

DROP VIEW IF EXISTS public.marketing_ads_accounts_public CASCADE;

CREATE VIEW public.marketing_ads_accounts_public
WITH (security_invoker = true)
AS
SELECT
  account.id,
  account.account_name,
  account.ad_account_id,
  account.business_name,
  account.currency,
  account.timezone_name,
  account.spend_limit,
  account.balance,
  account.adset_on,
  account.token_status,
  account.is_active,
  account.last_synced_at,
  account.created_by,
  creator.full_name AS created_by_name,
  creator.username AS created_by_username,
  creator_role.role::text AS created_by_role
FROM public.marketing_ads_accounts account
LEFT JOIN public.profiles creator
  ON creator.id = account.created_by
LEFT JOIN LATERAL (
  SELECT role
  FROM public.user_roles
  WHERE user_id = account.created_by
  ORDER BY role::text
  LIMIT 1
) creator_role ON true;

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
    public.has_role('admin'::public.app_role)
    OR public.has_role('employee'::public.app_role)
    OR public.has_role('leader'::public.app_role)
  )
  AND (
    public.has_role('admin'::public.app_role)
    OR employee_id = public.get_current_profile_id()
  )
);

GRANT SELECT (
  id,
  account_name,
  ad_account_id,
  business_name,
  created_by,
  currency,
  timezone_name,
  spend_limit,
  balance,
  adset_on,
  token_status,
  is_active,
  last_synced_at
) ON public.marketing_ads_accounts TO authenticated;

GRANT SELECT ON public.marketing_ads_accounts_public TO authenticated;

NOTIFY pgrst, 'reload schema';
