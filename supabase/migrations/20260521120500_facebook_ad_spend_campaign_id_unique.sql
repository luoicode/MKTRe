ALTER TABLE public.facebook_ad_spend_campaign_daily
  ADD COLUMN IF NOT EXISTS campaign_id text;

UPDATE public.facebook_ad_spend_campaign_daily
SET campaign_id = campaign_name
WHERE campaign_id IS NULL;

ALTER TABLE public.facebook_ad_spend_campaign_daily
  ALTER COLUMN campaign_id SET NOT NULL;

DROP INDEX IF EXISTS idx_facebook_ad_spend_campaign_daily_campaign_id;

CREATE INDEX IF NOT EXISTS idx_facebook_ad_spend_campaign_daily_campaign_id
  ON public.facebook_ad_spend_campaign_daily (campaign_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'facebook_ad_spend_campaign_daily_account_campaign_date_key'
      AND conrelid = 'public.facebook_ad_spend_campaign_daily'::regclass
  ) THEN
    ALTER TABLE public.facebook_ad_spend_campaign_daily
      ADD CONSTRAINT facebook_ad_spend_campaign_daily_account_campaign_date_key
      UNIQUE (ad_account_id, campaign_id, spend_date);
  END IF;
END $$;
