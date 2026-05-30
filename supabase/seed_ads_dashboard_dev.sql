-- Dev seed for Employee Ads Dashboard.
-- If the database already has an active Marketing employee, this seed assigns the test ads
-- account to the first one. If not, it creates a local-only employee profile:
--   email: ads.employee@mkt.local
--   username: ads_employee

WITH existing_employee AS (
  SELECT p.id
  FROM public.profiles p
  JOIN public.user_roles ur
    ON ur.user_id = p.id
   AND ur.role = 'employee'::public.app_role
  WHERE p.status = 'active'
  ORDER BY p.created_at ASC NULLS LAST, p.full_name ASC NULLS LAST
  LIMIT 1
),
fallback_auth AS (
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-00000000ad01'::uuid,
    'authenticated',
    'authenticated',
    'ads.employee@mkt.local',
    crypt('password123', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ads Dashboard Employee"}'::jsonb,
    now(),
    now()
  WHERE NOT EXISTS (SELECT 1 FROM existing_employee)
  ON CONFLICT (id) DO UPDATE
  SET
    instance_id = EXCLUDED.instance_id,
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = EXCLUDED.email_confirmed_at,
    confirmation_token = EXCLUDED.confirmation_token,
    recovery_token = EXCLUDED.recovery_token,
    email_change_token_new = EXCLUDED.email_change_token_new,
    email_change = EXCLUDED.email_change,
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = now()
  RETURNING id
),
fallback_identity AS (
  INSERT INTO auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    fallback_auth.id::text,
    fallback_auth.id,
    jsonb_build_object(
      'sub', fallback_auth.id::text,
      'email', 'ads.employee@mkt.local',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  FROM fallback_auth
  WHERE NOT EXISTS (
    SELECT 1
    FROM auth.identities identities
    WHERE identities.provider = 'email'
      AND identities.provider_id = fallback_auth.id::text
  )
),
fallback_profile AS (
  INSERT INTO public.profiles (
    auth_user_id,
    full_name,
    username,
    email,
    status
  )
  SELECT
    fallback_auth.id,
    'Ads Dashboard Employee',
    'ads_employee',
    'ads.employee@mkt.local',
    'active'::public.user_status
  FROM fallback_auth
  ON CONFLICT (auth_user_id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    username = EXCLUDED.username,
    email = EXCLUDED.email,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING id
),
fallback_role AS (
  INSERT INTO public.user_roles (user_id, role)
  SELECT fallback_profile.id, 'employee'::public.app_role
  FROM fallback_profile
  ON CONFLICT (user_id, role) DO NOTHING
),
selected_employee AS (
  SELECT id FROM existing_employee
  UNION ALL
  SELECT id FROM fallback_profile
  LIMIT 1
),
upsert_account AS (
  INSERT INTO public.marketing_ads_accounts (
    account_name,
    ad_account_id,
    business_name,
    currency,
    timezone_name,
    spend_limit,
    balance,
    adset_on,
    token_status,
    is_active,
    created_by,
    last_synced_at
  )
  SELECT
    'INV_AKA_DASNOTRI_HỮU HUY_01_26/05/26',
    'act_test_001',
    'MKTRe Dev Business',
    'VND',
    'Asia/Ho_Chi_Minh',
    100000000,
    12450000,
    18,
    'test',
    true,
    selected_employee.id,
    now()
  FROM selected_employee
  ON CONFLICT (ad_account_id) DO UPDATE
  SET
    account_name = EXCLUDED.account_name,
    business_name = EXCLUDED.business_name,
    currency = EXCLUDED.currency,
    timezone_name = EXCLUDED.timezone_name,
    spend_limit = EXCLUDED.spend_limit,
    balance = EXCLUDED.balance,
    adset_on = EXCLUDED.adset_on,
    token_status = EXCLUDED.token_status,
    is_active = EXCLUDED.is_active,
    last_synced_at = EXCLUDED.last_synced_at,
    updated_at = now()
  RETURNING id
),
target_account AS (
  SELECT id FROM upsert_account
  UNION
  SELECT id FROM public.marketing_ads_accounts WHERE ad_account_id = 'act_test_001'
),
upsert_assignment AS (
  INSERT INTO public.marketing_ads_account_assignments (
    ads_account_id,
    employee_id,
    assigned_by
  )
  SELECT
    target_account.id,
    selected_employee.id,
    selected_employee.id
  FROM target_account
  CROSS JOIN selected_employee
  ON CONFLICT (ads_account_id, employee_id) DO NOTHING
)
INSERT INTO public.marketing_ads_campaign_snapshots (
  ads_account_id,
  campaign_id,
  campaign_name,
  delivery,
  budget,
  spent,
  result_count,
  purchase_count,
  cost_per_result,
  active_adset_count,
  date_preset,
  date_start,
  date_end,
  synced_at,
  raw
)
SELECT
  target_account.id,
  campaign.campaign_id,
  campaign.campaign_name,
  campaign.delivery,
  campaign.budget,
  campaign.spent,
  campaign.result_count,
  campaign.purchase_count,
  CASE
    WHEN campaign.result_count > 0 THEN campaign.spent / campaign.result_count
    ELSE NULL
  END,
  campaign.active_adset_count,
  'today',
  NULL,
  NULL,
  now(),
  campaign.raw::jsonb
FROM target_account
CROSS JOIN (
  VALUES
    (
      'camp_test_001',
      'Notri Gold - Hữu Huy - MESS - 28/5 - A&',
      'ACTIVE',
      12000000::numeric,
      10550000::numeric,
      1245::numeric,
      89::numeric,
      4,
      '{"source":"dev_seed","result_type":"lead"}'
    ),
    (
      'camp_test_002',
      'Notri Gold - Hữu Huy - CĐ - 28/5 - B1 - Bản sao',
      'ACTIVE',
      15000000::numeric,
      13960000::numeric,
      567::numeric,
      0::numeric,
      2,
      '{"source":"dev_seed","result_type":"complete_registration"}'
    ),
    (
      'camp_test_003',
      'Notri Gold - Hữu Huy - CĐ - 28/5 - Z* - Bản sao',
      'WARNING',
      8500000::numeric,
      7290000::numeric,
      230::numeric,
      12::numeric,
      0,
      '{"source":"dev_seed","result_type":"complete_registration"}'
    ),
    (
      'camp_test_004',
      'Notri Gold - Hữu Huy - MESS - 28/5 - A& - Bản sao',
      'ACTIVE',
      10000000::numeric,
      9240000::numeric,
      880::numeric,
      41::numeric,
      3,
      '{"source":"dev_seed","result_type":"lead"}'
    )
) AS campaign(
  campaign_id,
  campaign_name,
  delivery,
  budget,
  spent,
  result_count,
  purchase_count,
  active_adset_count,
  raw
)
ON CONFLICT (ads_account_id, campaign_id, date_preset, date_start, date_end) DO UPDATE
SET
  campaign_name = EXCLUDED.campaign_name,
  delivery = EXCLUDED.delivery,
  budget = EXCLUDED.budget,
  spent = EXCLUDED.spent,
  result_count = EXCLUDED.result_count,
  purchase_count = EXCLUDED.purchase_count,
  cost_per_result = EXCLUDED.cost_per_result,
  active_adset_count = EXCLUDED.active_adset_count,
  synced_at = EXCLUDED.synced_at,
  raw = EXCLUDED.raw;
