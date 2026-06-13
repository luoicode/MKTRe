-- Seed linked Marketing Contacts and CRM V2 Sale Contacts test data.
-- This migration is intentionally idempotent for the seed batch below. It only
-- deletes rows created by this seed batch, then recreates them from real
-- profiles/teams resolved at migration time.

DO $$
BEGIN
  DELETE FROM public.marketing_contacts
  WHERE raw_payload->>'seed_batch' = 'crm_v2_sale_linked_seed_20260612';

  DELETE FROM public.lead_sources
  WHERE source_token LIKE 'src_seed_crm_v2_20260612_%';

  DELETE FROM public.customers
  WHERE customer_code LIKE 'CRMSEED-20260612-%';
END $$;

DROP TABLE IF EXISTS pg_temp.crm_seed_people;
CREATE TEMP TABLE crm_seed_people AS
WITH target_people(target_key, display_name, department_hint) AS (
  VALUES
    ('huy', 'Nguyễn Hữu Huy', 'marketing'),
    ('viet', 'Quốc Việt', 'marketing'),
    ('lyna', 'Phạm Thị Ly Na', 'sale'),
    ('vinh', 'Nguyễn Quang Vinh', 'sale'),
    ('dat', 'Vũ Trường Đạt', 'sale')
),
matched_profiles AS (
  SELECT DISTINCT ON (target_people.target_key)
    target_people.target_key,
    profiles.id AS profile_id,
    profiles.full_name,
    team_match.team_id,
    team_match.name AS team_name
  FROM target_people
  JOIN public.profiles profiles
    ON profiles.full_name = target_people.display_name
    OR (
      target_people.target_key = 'viet'
      AND profiles.full_name IN ('Quốc Việt', 'Nguyễn Quốc Việt', 'Tạ Quốc Việt', 'Đỗ Quốc Việt')
    )
  LEFT JOIN LATERAL (
    SELECT
      team_memberships.team_id,
      team.name,
      COALESCE(team.department, '') AS department,
      team_memberships.created_at
    FROM public.team_memberships team_memberships
    JOIN public.teams team ON team.id = team_memberships.team_id
    WHERE team_memberships.user_id = profiles.id
      AND team_memberships.is_active = true
    ORDER BY
      CASE WHEN COALESCE(team.department, '') = target_people.department_hint THEN 0 ELSE 1 END,
      team_memberships.created_at DESC
    LIMIT 1
  ) team_match ON true
  ORDER BY
    target_people.target_key,
    CASE WHEN profiles.status = 'active' THEN 0 ELSE 1 END,
    profiles.updated_at DESC
)
SELECT * FROM matched_profiles;

UPDATE public.profiles profiles
SET
  company_name = COALESCE(NULLIF(btrim(profiles.company_name), ''), 'DASNOTRI-01'),
  updated_at = now()
FROM crm_seed_people people
WHERE people.profile_id = profiles.id
  AND people.target_key IN ('huy', 'viet')
  AND NULLIF(btrim(profiles.company_name), '') IS NULL;

DROP TABLE IF EXISTS pg_temp.crm_seed_sources;
CREATE TEMP TABLE crm_seed_sources (
  source_key text PRIMARY KEY,
  marketer_key text NOT NULL,
  token text NOT NULL,
  source_name text NOT NULL,
  product text NOT NULL,
  channel text NOT NULL
);

INSERT INTO crm_seed_sources (source_key, marketer_key, token, source_name, product, channel)
VALUES
  ('huy_fb_mess', 'huy', 'src_seed_crm_v2_20260612_huy_fb_mess', 'Huy - NOTRIGOLD - Facebook mess', 'NOTRIGOLD', 'Facebook mess'),
  ('huy_fb_cdv', 'huy', 'src_seed_crm_v2_20260612_huy_fb_cdv', 'Huy - NOTRIGOLD - Facebook chuyển đổi', 'NOTRIGOLD', 'Facebook chuyển đổi'),
  ('huy_hotline', 'huy', 'src_seed_crm_v2_20260612_huy_hotline', 'Huy - NOTRIGOLD - Hotline', 'NOTRIGOLD', 'Hotline'),
  ('viet_tiktok_cdv', 'viet', 'src_seed_crm_v2_20260612_viet_tiktok_cdv', 'Quốc Việt - NOTRIGOLD - Tiktok chuyển đổi', 'NOTRIGOLD', 'Tiktok chuyển đổi'),
  ('viet_google', 'viet', 'src_seed_crm_v2_20260612_viet_google', 'Quốc Việt - NOTRIGOLD - Google', 'NOTRIGOLD', 'Google'),
  ('viet_youtube', 'viet', 'src_seed_crm_v2_20260612_viet_youtube', 'Quốc Việt - NOTRIGOLD - Youtube', 'NOTRIGOLD', 'Youtube');

INSERT INTO public.lead_sources (
  source_token,
  name,
  product,
  channel,
  team_id,
  owner_user_id,
  is_active,
  created_at,
  updated_at
)
SELECT
  seed_sources.token,
  seed_sources.source_name,
  seed_sources.product,
  seed_sources.channel,
  people.team_id,
  people.profile_id,
  true,
  now(),
  now()
FROM crm_seed_sources seed_sources
JOIN crm_seed_people people ON people.target_key = seed_sources.marketer_key
WHERE people.profile_id IS NOT NULL
ON CONFLICT (source_token) DO UPDATE SET
  name = EXCLUDED.name,
  product = EXCLUDED.product,
  channel = EXCLUDED.channel,
  team_id = EXCLUDED.team_id,
  owner_user_id = EXCLUDED.owner_user_id,
  is_active = true,
  updated_at = now();

DROP TABLE IF EXISTS pg_temp.crm_seed_base_leads;
CREATE TEMP TABLE crm_seed_base_leads (
  seq integer PRIMARY KEY,
  marketer_key text NOT NULL,
  sale_key text NOT NULL,
  source_key text NOT NULL,
  customer_name text NOT NULL,
  phone text NOT NULL,
  normalized_phone text NOT NULL,
  email text,
  mkt_status text NOT NULL,
  crm_status text NOT NULL,
  note text,
  order_amount numeric NOT NULL DEFAULT 0,
  order_status text,
  created_at timestamptz NOT NULL,
  landing_url text,
  campaign_name text,
  adset_name text,
  ad_name text
);

INSERT INTO crm_seed_base_leads (
  seq,
  marketer_key,
  sale_key,
  source_key,
  customer_name,
  phone,
  normalized_phone,
  email,
  mkt_status,
  crm_status,
  note,
  order_amount,
  order_status,
  created_at,
  landing_url,
  campaign_name,
  adset_name,
  ad_name
)
VALUES
  (1, 'huy', 'lyna', 'huy_fb_mess', 'Lê Văn Cường', '0965111222', '84965111222', 'cuong.seed@example.com', 'new', 'new', 'Khách hỏi combo 3 hũ, cần gọi tư vấn.', 0, NULL, '2026-06-12 08:05:00+07', 'https://landing.dasnotri.vn/notrigold-fb-a1', 'Seed FB Mess Huy', 'A1 - Mess', 'Ad 01'),
  (2, 'huy', 'lyna', 'huy_fb_cdv', 'Nguyễn Thị Mai', '0988123456', '84988123456', 'mai.seed@example.com', 'processing', 'processing', 'Khách quan tâm combo 5 hũ, hẹn gọi lại sau 17h.', 390000, 'Đang giao', '2026-06-12 08:22:00+07', 'https://landing.dasnotri.vn/notrigold-cdv-b1', 'Seed FB CDV Huy', 'B1 - CDV', 'Ad 02'),
  (3, 'huy', 'lyna', 'huy_hotline', 'Trần Quốc Huy', '0902345678', '84902345678', 'huy.seed@example.com', 'called', 'called', 'Đã gọi, khách xin thêm thông tin sản phẩm.', 0, NULL, '2026-06-12 09:10:00+07', NULL, 'Seed Hotline Huy', 'Hotline', 'Hotline'),
  (4, 'huy', 'lyna', 'huy_fb_mess', 'Đỗ Minh Tâm', '0911222333', '84911222333', 'tam.seed@example.com', 'quoted', 'quoted', NULL, 780000, 'Báo giá', '2026-06-12 09:45:00+07', 'https://landing.dasnotri.vn/notrigold-fb-a2', 'Seed FB Mess Huy', 'A2 - Mess', 'Ad 03'),
  (5, 'huy', 'vinh', 'huy_fb_cdv', 'Hoàng Anh Đức', '0933444555', '84933444555', 'duc.seed@example.com', 'delivering', 'shipping', 'Khách đã xác nhận địa chỉ nhận hàng.', 390000, 'Đang giao', '2026-06-11 10:20:00+07', 'https://landing.dasnotri.vn/notrigold-cdv-b2', 'Seed FB CDV Huy', 'B2 - CDV', 'Ad 04'),
  (6, 'huy', 'vinh', 'huy_hotline', 'Bùi Lan Hương', '0977000111', '84977000111', 'huong.seed@example.com', 'completed', 'success', 'Đơn hoàn thành, khách hài lòng.', 1170000, 'Hoàn thành', '2026-06-11 11:05:00+07', NULL, 'Seed Hotline Huy', 'Hotline', 'Hotline'),
  (7, 'huy', 'vinh', 'huy_fb_mess', 'Vũ Thanh Sơn', '0888999000', '84888999000', 'son.seed@example.com', 'returned', 'returned', NULL, 390000, 'Hoàn', '2026-06-10 14:30:00+07', 'https://landing.dasnotri.vn/notrigold-fb-a3', 'Seed FB Mess Huy', 'A3 - Mess', 'Ad 05'),
  (8, 'huy', 'vinh', 'huy_fb_cdv', 'Phan Khánh Linh', '0855123123', '84855123123', 'linh.seed@example.com', 'cancelled', 'cancelled', 'Khách huỷ do chưa có nhu cầu.', 0, NULL, '2026-06-10 15:15:00+07', 'https://landing.dasnotri.vn/notrigold-cdv-b3', 'Seed FB CDV Huy', 'B3 - CDV', 'Ad 06'),
  (9, 'viet', 'vinh', 'viet_tiktok_cdv', 'Ngô Đức Long', '0866777888', '84866777888', 'long.seed@example.com', 'new', 'new', NULL, 0, NULL, '2026-06-09 08:40:00+07', 'https://landing.dasnotri.vn/notrigold-tt-c1', 'Seed TikTok Việt', 'C1 - TikTok', 'Ad 07'),
  (10, 'viet', 'dat', 'viet_google', 'Mai Thu Trang', '0944555666', '84944555666', 'trang.seed@example.com', 'processing', 'processing', 'Khách cần xác nhận lại đơn vị vận chuyển.', 390000, 'Đang xử lí', '2026-06-09 09:25:00+07', 'https://landing.dasnotri.vn/notrigold-google-g1', 'Seed Google Việt', 'G1 - Search', 'Ad 08'),
  (11, 'viet', 'dat', 'viet_youtube', 'Đặng Quốc Bảo', '0922333444', '84922333444', 'bao.seed@example.com', 'called', 'called', NULL, 0, NULL, '2026-06-08 10:00:00+07', 'https://landing.dasnotri.vn/notrigold-yt-y1', 'Seed Youtube Việt', 'Y1 - Video', 'Ad 09'),
  (12, 'viet', 'dat', 'viet_tiktok_cdv', 'Trịnh Minh Anh', '0833666999', '84833666999', 'anh.seed@example.com', 'quoted', 'quoted', 'Đã gửi báo giá combo 3 hũ.', 0, NULL, '2026-06-08 11:45:00+07', 'https://landing.dasnotri.vn/notrigold-tt-c2', 'Seed TikTok Việt', 'C2 - TikTok', 'Ad 10'),
  (13, 'viet', 'dat', 'viet_google', 'Lương Gia Bảo', '0877888999', '84877888999', 'giabao.seed@example.com', 'delivering', 'shipping', NULL, 780000, 'Đang giao', '2026-06-07 13:10:00+07', 'https://landing.dasnotri.vn/notrigold-google-g2', 'Seed Google Việt', 'G2 - Search', 'Ad 11'),
  (14, 'viet', 'dat', 'viet_youtube', 'Hồ Ngọc Ánh', '0899111222', '84899111222', 'ngocanh.seed@example.com', 'completed', 'success', 'Khách đã nhận hàng và thanh toán COD.', 390000, 'Hoàn thành', '2026-06-07 14:35:00+07', 'https://landing.dasnotri.vn/notrigold-yt-y2', 'Seed Youtube Việt', 'Y2 - Video', 'Ad 12'),
  (15, 'viet', 'lyna', 'viet_tiktok_cdv', 'Chu Hải Nam', '0811222333', '84811222333', 'hainam.seed@example.com', 'cancelled', 'cancelled', 'Khách không nghe máy sau nhiều lần gọi.', 0, NULL, '2026-06-06 16:05:00+07', 'https://landing.dasnotri.vn/notrigold-tt-c3', 'Seed TikTok Việt', 'C3 - TikTok', 'Ad 13');

INSERT INTO public.marketing_contacts (
  lead_source_id,
  source_token,
  owner_user_id,
  team_id,
  customer_name,
  phone,
  normalized_phone,
  email,
  message,
  landing_url,
  campaign_name,
  adset_name,
  ad_name,
  source_name,
  source_channel,
  sales_owner_name,
  sales_team_name,
  status,
  is_duplicate,
  duplicate_scope,
  duplicate_of_contact_id,
  duplicate_checked_at,
  eligible_for_sale_distribution,
  raw_payload,
  created_at,
  updated_at
)
SELECT
  lead_sources.id,
  lead_sources.source_token,
  marketer.profile_id,
  marketer.team_id,
  base.customer_name,
  base.phone,
  base.normalized_phone,
  base.email,
  base.note,
  base.landing_url,
  base.campaign_name,
  base.adset_name,
  base.ad_name,
  lead_sources.name,
  lead_sources.channel,
  sale.full_name,
  sale.team_name,
  base.mkt_status,
  false,
  NULL,
  NULL,
  now(),
  true,
  jsonb_build_object(
    'seed_batch', 'crm_v2_sale_linked_seed_20260612',
    'seed_seq', base.seq,
    'sale_note', base.note,
    'product', 'NOTRIGOLD'
  ),
  base.created_at,
  base.created_at
FROM crm_seed_base_leads base
JOIN crm_seed_people marketer ON marketer.target_key = base.marketer_key
JOIN crm_seed_people sale ON sale.target_key = base.sale_key
JOIN public.lead_sources lead_sources ON lead_sources.source_token = (
  SELECT token FROM crm_seed_sources WHERE source_key = base.source_key
)
WHERE marketer.profile_id IS NOT NULL;

DROP TABLE IF EXISTS pg_temp.crm_seed_duplicate_leads;
CREATE TEMP TABLE crm_seed_duplicate_leads (
  seq integer PRIMARY KEY,
  marketer_key text NOT NULL,
  source_key text NOT NULL,
  customer_name text NOT NULL,
  duplicate_phone text NOT NULL,
  duplicate_normalized_phone text NOT NULL,
  created_at timestamptz NOT NULL
);

INSERT INTO crm_seed_duplicate_leads (
  seq,
  marketer_key,
  source_key,
  customer_name,
  duplicate_phone,
  duplicate_normalized_phone,
  created_at
)
VALUES
  (101, 'viet', 'viet_google', 'Test Trùng Quốc Việt 1', '0965111222', '84965111222', '2026-06-12 10:05:00+07'),
  (102, 'huy', 'huy_hotline', 'Test Trùng Huy 1', '0988123456', '84988123456', '2026-06-12 10:12:00+07');

INSERT INTO public.marketing_contacts (
  lead_source_id,
  source_token,
  owner_user_id,
  team_id,
  customer_name,
  phone,
  normalized_phone,
  email,
  message,
  landing_url,
  campaign_name,
  adset_name,
  ad_name,
  source_name,
  source_channel,
  sales_owner_name,
  sales_team_name,
  status,
  is_duplicate,
  duplicate_scope,
  duplicate_of_contact_id,
  duplicate_checked_at,
  eligible_for_sale_distribution,
  raw_payload,
  created_at,
  updated_at
)
SELECT
  lead_sources.id,
  lead_sources.source_token,
  marketer.profile_id,
  marketer.team_id,
  dup.customer_name,
  dup.duplicate_phone,
  dup.duplicate_normalized_phone,
  NULL,
  'Lead trùng dùng để kiểm thử duplicate trong 7 ngày.',
  NULL,
  'Seed Duplicate Check',
  'Duplicate',
  'Duplicate',
  lead_sources.name,
  lead_sources.channel,
  '—',
  '—',
  'duplicate',
  true,
  'owner_7_days',
  original_contact.id,
  now(),
  false,
  jsonb_build_object(
    'seed_batch', 'crm_v2_sale_linked_seed_20260612',
    'seed_seq', dup.seq,
    'duplicate_reason', 'same_normalized_phone_within_7_days'
  ),
  dup.created_at,
  dup.created_at
FROM crm_seed_duplicate_leads dup
JOIN crm_seed_people marketer ON marketer.target_key = dup.marketer_key
JOIN public.lead_sources lead_sources ON lead_sources.source_token = (
  SELECT token FROM crm_seed_sources WHERE source_key = dup.source_key
)
JOIN LATERAL (
  SELECT contacts.id
  FROM public.marketing_contacts contacts
  WHERE contacts.normalized_phone = dup.duplicate_normalized_phone
    AND contacts.raw_payload->>'seed_batch' = 'crm_v2_sale_linked_seed_20260612'
    AND contacts.is_duplicate = false
  ORDER BY contacts.created_at ASC
  LIMIT 1
) original_contact ON true
WHERE marketer.profile_id IS NOT NULL;

INSERT INTO public.customers (
  customer_code,
  customer_name,
  phone,
  normalized_phone,
  email,
  status,
  customer_type,
  assigned_sale_id,
  assigned_sale_name,
  sale_team_id,
  sale_team_name,
  last_contact_at,
  next_followup_at,
  contact_count,
  total_orders,
  completed_orders,
  completed_revenue,
  lifetime_value,
  created_at,
  updated_at
)
SELECT
  'CRMSEED-20260612-' || lpad(base.seq::text, 3, '0'),
  base.customer_name,
  base.phone,
  base.normalized_phone,
  base.email,
  base.crm_status,
  CASE WHEN base.seq IN (6, 14) THEN 'old_customer' ELSE 'lead' END,
  sale.profile_id,
  sale.full_name,
  sale.team_id,
  sale.team_name,
  CASE WHEN base.crm_status <> 'new' THEN base.created_at + interval '30 minutes' ELSE NULL END,
  CASE WHEN base.crm_status IN ('processing', 'called', 'quoted') THEN base.created_at + interval '1 day' ELSE NULL END,
  CASE WHEN base.crm_status = 'new' THEN 0 ELSE 1 END,
  CASE WHEN base.order_amount > 0 THEN 1 ELSE 0 END,
  CASE WHEN base.crm_status = 'success' AND base.order_amount > 0 THEN 1 ELSE 0 END,
  CASE WHEN base.crm_status = 'success' THEN base.order_amount ELSE 0 END,
  base.order_amount,
  base.created_at,
  base.created_at
FROM crm_seed_base_leads base
JOIN crm_seed_people sale ON sale.target_key = base.sale_key
WHERE sale.profile_id IS NOT NULL
ON CONFLICT (customer_code) DO UPDATE SET
  customer_name = EXCLUDED.customer_name,
  phone = EXCLUDED.phone,
  normalized_phone = EXCLUDED.normalized_phone,
  email = EXCLUDED.email,
  status = EXCLUDED.status,
  customer_type = EXCLUDED.customer_type,
  assigned_sale_id = EXCLUDED.assigned_sale_id,
  assigned_sale_name = EXCLUDED.assigned_sale_name,
  sale_team_id = EXCLUDED.sale_team_id,
  sale_team_name = EXCLUDED.sale_team_name,
  last_contact_at = EXCLUDED.last_contact_at,
  next_followup_at = EXCLUDED.next_followup_at,
  contact_count = EXCLUDED.contact_count,
  total_orders = EXCLUDED.total_orders,
  completed_orders = EXCLUDED.completed_orders,
  completed_revenue = EXCLUDED.completed_revenue,
  lifetime_value = EXCLUDED.lifetime_value,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.customer_sources (
  customer_id,
  lead_source_id,
  source_name,
  source_channel,
  landing_url,
  campaign_name,
  adset_name,
  ad_name,
  marketer_id,
  marketer_name,
  created_at
)
SELECT
  customers.id,
  lead_sources.id,
  lead_sources.name,
  lead_sources.channel,
  base.landing_url,
  base.campaign_name,
  base.adset_name,
  base.ad_name,
  marketer.profile_id,
  marketer.full_name,
  base.created_at
FROM crm_seed_base_leads base
JOIN public.customers customers
  ON customers.customer_code = 'CRMSEED-20260612-' || lpad(base.seq::text, 3, '0')
JOIN crm_seed_people marketer ON marketer.target_key = base.marketer_key
JOIN public.lead_sources lead_sources ON lead_sources.source_token = (
  SELECT token FROM crm_seed_sources WHERE source_key = base.source_key
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customer_sources existing_sources
  WHERE existing_sources.customer_id = customers.id
    AND existing_sources.source_channel IS NOT DISTINCT FROM lead_sources.channel
    AND existing_sources.campaign_name IS NOT DISTINCT FROM base.campaign_name
    AND existing_sources.created_at = base.created_at
);

INSERT INTO public.customer_sources (
  customer_id,
  lead_source_id,
  source_name,
  source_channel,
  landing_url,
  campaign_name,
  adset_name,
  ad_name,
  marketer_id,
  marketer_name,
  created_at
)
SELECT
  customers.id,
  lead_sources.id,
  lead_sources.name,
  lead_sources.channel,
  NULL,
  'Seed Duplicate Check',
  'Duplicate',
  'Duplicate',
  marketer.profile_id,
  marketer.full_name,
  dup.created_at
FROM crm_seed_duplicate_leads dup
JOIN public.customers customers ON customers.normalized_phone = dup.duplicate_normalized_phone
JOIN crm_seed_people marketer ON marketer.target_key = dup.marketer_key
JOIN public.lead_sources lead_sources ON lead_sources.source_token = (
  SELECT token FROM crm_seed_sources WHERE source_key = dup.source_key
)
WHERE customers.customer_code LIKE 'CRMSEED-20260612-%'
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_sources existing_sources
    WHERE existing_sources.customer_id = customers.id
      AND existing_sources.source_channel IS NOT DISTINCT FROM lead_sources.channel
      AND existing_sources.campaign_name = 'Seed Duplicate Check'
      AND existing_sources.created_at = dup.created_at
  );

INSERT INTO public.customer_notes (
  customer_id,
  note,
  created_by,
  created_by_name,
  created_at,
  updated_at
)
SELECT
  customers.id,
  base.note,
  sale.profile_id,
  sale.full_name,
  base.created_at + interval '35 minutes',
  base.created_at + interval '35 minutes'
FROM crm_seed_base_leads base
JOIN public.customers customers
  ON customers.customer_code = 'CRMSEED-20260612-' || lpad(base.seq::text, 3, '0')
JOIN crm_seed_people sale ON sale.target_key = base.sale_key
WHERE base.note IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_notes existing_notes
    WHERE existing_notes.customer_id = customers.id
      AND existing_notes.note = base.note
      AND existing_notes.deleted_at IS NULL
  );

INSERT INTO public.customer_orders (
  customer_id,
  order_code,
  product_name,
  quantity,
  amount,
  status,
  order_date,
  created_at
)
SELECT
  customers.id,
  'S' || (112300 + base.seq)::text,
  'DT - NOTRIGOLD - 1 KG',
  CASE WHEN base.order_amount >= 780000 THEN 2 ELSE 1 END,
  base.order_amount,
  base.order_status,
  base.created_at + interval '1 hour',
  base.created_at + interval '1 hour'
FROM crm_seed_base_leads base
JOIN public.customers customers
  ON customers.customer_code = 'CRMSEED-20260612-' || lpad(base.seq::text, 3, '0')
WHERE base.order_amount > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_orders existing_orders
    WHERE existing_orders.customer_id = customers.id
      AND existing_orders.order_code = 'S' || (112300 + base.seq)::text
  );

INSERT INTO public.customer_assignments (
  customer_id,
  to_sale_id,
  to_sale_name,
  to_sale_team_id,
  to_sale_team_name,
  assignment_type,
  reason,
  assigned_by_name,
  assigned_at,
  created_at
)
SELECT
  customers.id,
  sale.profile_id,
  sale.full_name,
  sale.team_id,
  sale.team_name,
  'auto_assign',
  'Seed linked CRM V2 data',
  'Hệ thống',
  base.created_at + interval '10 minutes',
  base.created_at + interval '10 minutes'
FROM crm_seed_base_leads base
JOIN public.customers customers
  ON customers.customer_code = 'CRMSEED-20260612-' || lpad(base.seq::text, 3, '0')
JOIN crm_seed_people sale ON sale.target_key = base.sale_key
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customer_assignments existing_assignments
  WHERE existing_assignments.customer_id = customers.id
    AND existing_assignments.assignment_type = 'auto_assign'
    AND existing_assignments.assigned_at = base.created_at + interval '10 minutes'
);

INSERT INTO public.customer_activities (
  customer_id,
  activity_type,
  description,
  actor_id,
  actor_name,
  created_at
)
SELECT
  customers.id,
  'lead_created',
  'Lead được tạo từ ' || COALESCE(lead_sources.channel, 'Nguồn Marketing'),
  marketer.profile_id,
  marketer.full_name,
  base.created_at
FROM crm_seed_base_leads base
JOIN public.customers customers
  ON customers.customer_code = 'CRMSEED-20260612-' || lpad(base.seq::text, 3, '0')
JOIN crm_seed_people marketer ON marketer.target_key = base.marketer_key
JOIN public.lead_sources lead_sources ON lead_sources.source_token = (
  SELECT token FROM crm_seed_sources WHERE source_key = base.source_key
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customer_activities existing_activities
  WHERE existing_activities.customer_id = customers.id
    AND existing_activities.activity_type = 'lead_created'
    AND existing_activities.created_at = base.created_at
);

INSERT INTO public.customer_activities (
  customer_id,
  activity_type,
  description,
  actor_id,
  actor_name,
  created_at
)
SELECT
  customers.id,
  'assigned_sale',
  'Chia cho ' || sale.full_name || COALESCE(' / ' || sale.team_name, ''),
  NULL,
  'Hệ thống',
  base.created_at + interval '10 minutes'
FROM crm_seed_base_leads base
JOIN public.customers customers
  ON customers.customer_code = 'CRMSEED-20260612-' || lpad(base.seq::text, 3, '0')
JOIN crm_seed_people sale ON sale.target_key = base.sale_key
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customer_activities existing_activities
  WHERE existing_activities.customer_id = customers.id
    AND existing_activities.activity_type = 'assigned_sale'
    AND existing_activities.created_at = base.created_at + interval '10 minutes'
);

INSERT INTO public.customer_activities (
  customer_id,
  activity_type,
  description,
  actor_id,
  actor_name,
  created_at
)
SELECT
  customers.id,
  'status_changed',
  'Chuyển trạng thái: ' || base.crm_status,
  sale.profile_id,
  sale.full_name,
  base.created_at + interval '20 minutes'
FROM crm_seed_base_leads base
JOIN public.customers customers
  ON customers.customer_code = 'CRMSEED-20260612-' || lpad(base.seq::text, 3, '0')
JOIN crm_seed_people sale ON sale.target_key = base.sale_key
WHERE base.crm_status <> 'new'
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_activities existing_activities
    WHERE existing_activities.customer_id = customers.id
      AND existing_activities.activity_type = 'status_changed'
      AND existing_activities.created_at = base.created_at + interval '20 minutes'
  );

INSERT INTO public.customer_activities (
  customer_id,
  activity_type,
  description,
  actor_id,
  actor_name,
  created_at
)
SELECT
  customers.id,
  'note_created',
  'Thêm ghi chú: ' || base.note,
  sale.profile_id,
  sale.full_name,
  base.created_at + interval '35 minutes'
FROM crm_seed_base_leads base
JOIN public.customers customers
  ON customers.customer_code = 'CRMSEED-20260612-' || lpad(base.seq::text, 3, '0')
JOIN crm_seed_people sale ON sale.target_key = base.sale_key
WHERE base.note IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.customer_activities existing_activities
    WHERE existing_activities.customer_id = customers.id
      AND existing_activities.activity_type = 'note_created'
      AND existing_activities.created_at = base.created_at + interval '35 minutes'
  );

NOTIFY pgrst, 'reload schema';

-- Verification queries:
-- WITH expected(full_name) AS (
--   VALUES ('Nguyễn Hữu Huy'), ('Quốc Việt'), ('Phạm Thị Ly Na'), ('Nguyễn Quang Vinh'), ('Vũ Trường Đạt')
-- )
-- SELECT expected.full_name AS expected_name, profiles.id AS profile_id, profiles.full_name
-- FROM expected
-- LEFT JOIN public.profiles profiles
--   ON profiles.full_name = expected.full_name
--   OR (expected.full_name = 'Quốc Việt' AND profiles.full_name IN ('Quốc Việt', 'Nguyễn Quốc Việt', 'Đỗ Quốc Việt'))
-- ORDER BY expected.full_name;
-- SELECT owner.full_name AS marketer, count(*) AS marketing_contacts_count
-- FROM public.marketing_contacts contacts
-- JOIN public.profiles owner ON owner.id = contacts.owner_user_id
-- WHERE contacts.raw_payload->>'seed_batch' = 'crm_v2_sale_linked_seed_20260612'
-- GROUP BY owner.full_name
-- ORDER BY owner.full_name;
-- SELECT assigned_sale_name, count(*) AS customers_count
-- FROM public.customers
-- WHERE customer_code LIKE 'CRMSEED-20260612-%'
-- GROUP BY assigned_sale_name
-- ORDER BY assigned_sale_name;
-- SELECT count(*) AS duplicate_marketing_contacts
-- FROM public.marketing_contacts
-- WHERE raw_payload->>'seed_batch' = 'crm_v2_sale_linked_seed_20260612'
--   AND is_duplicate = true
--   AND eligible_for_sale_distribution = false;
-- SELECT count(*) AS customer_notes_count
-- FROM public.customer_notes notes
-- JOIN public.customers customers ON customers.id = notes.customer_id
-- WHERE customers.customer_code LIKE 'CRMSEED-20260612-%'
--   AND notes.deleted_at IS NULL;
-- SELECT count(*) AS customer_orders_count
-- FROM public.customer_orders orders
-- JOIN public.customers customers ON customers.id = orders.customer_id
-- WHERE customers.customer_code LIKE 'CRMSEED-20260612-%';
-- SELECT activity_type, count(*) AS activity_count
-- FROM public.customer_activities activities
-- JOIN public.customers customers ON customers.id = activities.customer_id
-- WHERE customers.customer_code LIKE 'CRMSEED-20260612-%'
-- GROUP BY activity_type
-- ORDER BY activity_type;
