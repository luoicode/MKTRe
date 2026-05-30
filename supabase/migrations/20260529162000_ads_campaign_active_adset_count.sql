ALTER TABLE public.marketing_ads_campaign_snapshots
ADD COLUMN IF NOT EXISTS active_adset_count integer NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
