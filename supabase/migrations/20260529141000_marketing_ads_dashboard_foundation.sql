CREATE TABLE IF NOT EXISTS public.marketing_ads_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  ad_account_id text NOT NULL,
  business_name text,
  currency text NOT NULL DEFAULT 'VND',
  timezone_name text,
  spend_limit numeric NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0,
  adset_on integer NOT NULL DEFAULT 0,
  access_token_encrypted text,
  token_status text NOT NULL DEFAULT 'test',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_ads_accounts_ad_account_id_key UNIQUE (ad_account_id),
  CONSTRAINT marketing_ads_accounts_token_status_check CHECK (
    token_status IN ('test', 'active', 'expired', 'revoked', 'invalid')
  )
);

CREATE TABLE IF NOT EXISTS public.marketing_ads_account_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ads_account_id uuid NOT NULL REFERENCES public.marketing_ads_accounts(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_ads_account_assignments_unique UNIQUE (ads_account_id, employee_id)
);

CREATE TABLE IF NOT EXISTS public.marketing_ads_campaign_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ads_account_id uuid NOT NULL REFERENCES public.marketing_ads_accounts(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  delivery text NOT NULL,
  budget numeric,
  spent numeric NOT NULL DEFAULT 0,
  result_count numeric NOT NULL DEFAULT 0,
  purchase_count numeric NOT NULL DEFAULT 0,
  cost_per_result numeric,
  date_preset text NOT NULL DEFAULT 'today',
  date_start date,
  date_end date,
  synced_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb,
  CONSTRAINT marketing_ads_campaign_snapshots_unique UNIQUE (
    ads_account_id,
    campaign_id,
    date_preset,
    date_start,
    date_end
  )
);

CREATE INDEX IF NOT EXISTS idx_marketing_ads_accounts_team_id
  ON public.marketing_ads_accounts(team_id);

CREATE INDEX IF NOT EXISTS idx_marketing_ads_accounts_is_active
  ON public.marketing_ads_accounts(is_active);

CREATE INDEX IF NOT EXISTS idx_marketing_ads_account_assignments_employee_id
  ON public.marketing_ads_account_assignments(employee_id);

CREATE INDEX IF NOT EXISTS idx_marketing_ads_campaign_snapshots_account
  ON public.marketing_ads_campaign_snapshots(ads_account_id);

CREATE INDEX IF NOT EXISTS idx_marketing_ads_campaign_snapshots_date
  ON public.marketing_ads_campaign_snapshots(date_preset, date_start, date_end);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_ads_campaign_snapshots_unique_nulls
  ON public.marketing_ads_campaign_snapshots(
    ads_account_id,
    campaign_id,
    date_preset,
    date_start,
    date_end
  )
  NULLS NOT DISTINCT;

DROP TRIGGER IF EXISTS tr_marketing_ads_accounts_updated ON public.marketing_ads_accounts;
CREATE TRIGGER tr_marketing_ads_accounts_updated
BEFORE UPDATE ON public.marketing_ads_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.can_select_marketing_ads_account(_ads_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_active_user()
    AND public.has_role('employee'::public.app_role)
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

GRANT EXECUTE ON FUNCTION public.can_select_marketing_ads_account(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.marketing_ads_accounts_public
WITH (security_invoker = true)
AS
SELECT
  id,
  account_name,
  ad_account_id,
  business_name,
  currency,
  timezone_name,
  spend_limit,
  balance,
  adset_on,
  is_active,
  last_synced_at
FROM public.marketing_ads_accounts;

ALTER TABLE public.marketing_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ads_account_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ads_campaign_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_ads_accounts_employee_select_assigned
  ON public.marketing_ads_accounts;
CREATE POLICY marketing_ads_accounts_employee_select_assigned
ON public.marketing_ads_accounts
FOR SELECT
TO authenticated
USING (public.can_select_marketing_ads_account(id));

DROP POLICY IF EXISTS marketing_ads_campaign_snapshots_employee_select_assigned
  ON public.marketing_ads_campaign_snapshots;
CREATE POLICY marketing_ads_campaign_snapshots_employee_select_assigned
ON public.marketing_ads_campaign_snapshots
FOR SELECT
TO authenticated
USING (public.can_select_marketing_ads_account(ads_account_id));

DROP POLICY IF EXISTS marketing_ads_account_assignments_employee_select_own
  ON public.marketing_ads_account_assignments;
CREATE POLICY marketing_ads_account_assignments_employee_select_own
ON public.marketing_ads_account_assignments
FOR SELECT
TO authenticated
USING (
  public.is_active_user()
  AND public.has_role('employee'::public.app_role)
  AND employee_id = public.get_current_profile_id()
);

REVOKE ALL ON TABLE public.marketing_ads_accounts FROM anon, authenticated;
REVOKE ALL ON TABLE public.marketing_ads_account_assignments FROM anon, authenticated;
REVOKE ALL ON TABLE public.marketing_ads_campaign_snapshots FROM anon, authenticated;
REVOKE ALL ON TABLE public.marketing_ads_accounts_public FROM anon, authenticated;

GRANT SELECT (
  id,
  account_name,
  ad_account_id,
  business_name,
  currency,
  timezone_name,
  spend_limit,
  balance,
  adset_on,
  is_active,
  last_synced_at
) ON public.marketing_ads_accounts TO authenticated;

GRANT SELECT ON public.marketing_ads_accounts_public TO authenticated;
GRANT SELECT ON public.marketing_ads_account_assignments TO authenticated;
GRANT SELECT ON public.marketing_ads_campaign_snapshots TO authenticated;

NOTIFY pgrst, 'reload schema';
