COMMENT ON TABLE public.profile_channels IS
  'Deprecated client-side source. Official channel links now live in public.assets as asset_group=personal and asset_type in Facebook/TikTok/Google. Kept for production data retention.';

INSERT INTO public.assets (
  asset_group,
  asset_type,
  title,
  value,
  link_url,
  description,
  owner_profile_id,
  owner_team_id,
  assigned_by,
  created_by,
  is_active,
  created_at,
  updated_at
)
SELECT
  'personal',
  CASE pc.channel
    WHEN 'facebook' THEN 'Facebook'
    WHEN 'tiktok' THEN 'TikTok'
    WHEN 'google' THEN 'Google'
    ELSE pc.channel
  END,
  CASE pc.channel
    WHEN 'facebook' THEN 'Facebook'
    WHEN 'tiktok' THEN 'TikTok'
    WHEN 'google' THEN 'Google'
    ELSE pc.channel
  END,
  NULL,
  pc.link_url,
  'Kênh chạy chính thức',
  pc.user_id,
  NULL,
  NULL,
  pc.user_id,
  true,
  pc.created_at,
  pc.updated_at
FROM public.profile_channels pc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.assets a
  WHERE a.asset_group = 'personal'
    AND a.owner_profile_id = pc.user_id
    AND a.asset_type = CASE pc.channel
      WHEN 'facebook' THEN 'Facebook'
      WHEN 'tiktok' THEN 'TikTok'
      WHEN 'google' THEN 'Google'
      ELSE pc.channel
    END
);

NOTIFY pgrst, 'reload schema';
