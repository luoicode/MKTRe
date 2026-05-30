ALTER TABLE public.marketing_ads_accounts
ADD COLUMN IF NOT EXISTS amount_spent numeric NOT NULL DEFAULT 0;

UPDATE public.marketing_ads_accounts
SET amount_spent = GREATEST(spend_limit - balance, 0)
WHERE amount_spent = 0
  AND spend_limit > 0
  AND balance >= 0;

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
  account.amount_spent,
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

GRANT SELECT (
  id,
  account_name,
  ad_account_id,
  business_name,
  created_by,
  currency,
  timezone_name,
  spend_limit,
  amount_spent,
  balance,
  adset_on,
  token_status,
  is_active,
  last_synced_at
) ON public.marketing_ads_accounts TO authenticated;

GRANT SELECT ON public.marketing_ads_accounts_public TO authenticated;

NOTIFY pgrst, 'reload schema';
