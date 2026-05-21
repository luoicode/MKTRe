CREATE TABLE IF NOT EXISTS public.facebook_ad_spend_campaign_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id text NOT NULL,
  campaign_name text NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  spend_date date NOT NULL,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, campaign_name, spend_date)
);

CREATE INDEX IF NOT EXISTS idx_facebook_ad_spend_campaign_daily_spend_date
  ON public.facebook_ad_spend_campaign_daily (spend_date);

CREATE INDEX IF NOT EXISTS idx_facebook_ad_spend_campaign_daily_campaign_lower
  ON public.facebook_ad_spend_campaign_daily (lower(campaign_name));

ALTER TABLE public.facebook_ad_spend_campaign_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "facebook_ad_spend_campaign_daily_select_authenticated"
  ON public.facebook_ad_spend_campaign_daily;

CREATE POLICY "facebook_ad_spend_campaign_daily_select_authenticated"
  ON public.facebook_ad_spend_campaign_daily
  FOR SELECT
  TO authenticated
  USING (true);
