-- CRM V2 legacy backfill.
-- This migration reads legacy marketing_contacts/contact_notes data and writes
-- into the new CRM V2 tables only. It does not modify legacy tables.

WITH ranked_contacts AS (
  SELECT
    contacts.*,
    btrim(contacts.normalized_phone) AS normalized_phone_key,
    row_number() OVER (
      PARTITION BY btrim(contacts.normalized_phone)
      ORDER BY
        CASE
          WHEN COALESCE(contacts.is_duplicate, false) = false
           AND COALESCE(NULLIF(contacts.status, ''), 'new') <> 'duplicate'
          THEN 0
          ELSE 1
        END,
        COALESCE(contacts.updated_at, contacts.created_at) DESC,
        contacts.created_at DESC,
        contacts.id
    ) AS dedupe_rank
  FROM public.marketing_contacts contacts
  WHERE NULLIF(btrim(contacts.normalized_phone), '') IS NOT NULL
    AND NULLIF(btrim(contacts.phone), '') IS NOT NULL
)
INSERT INTO public.customers (
  customer_name,
  phone,
  normalized_phone,
  email,
  status,
  customer_type,
  assigned_sale_name,
  sale_team_name,
  created_at,
  updated_at
)
SELECT
  NULLIF(btrim(customer_name), ''),
  btrim(phone),
  normalized_phone_key,
  NULLIF(btrim(email), ''),
  COALESCE(NULLIF(btrim(status), ''), 'new'),
  'lead',
  NULLIF(btrim(sales_owner_name), ''),
  NULLIF(btrim(sales_team_name), ''),
  COALESCE(created_at, now()),
  COALESCE(updated_at, created_at, now())
FROM ranked_contacts
WHERE dedupe_rank = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.customers existing_customers
    WHERE existing_customers.normalized_phone = ranked_contacts.normalized_phone_key
  );

WITH source_rows AS (
  SELECT
    customers.id AS customer_id,
    contacts.lead_source_id,
    COALESCE(NULLIF(btrim(contacts.source_name), ''), NULLIF(btrim(lead_sources.name), '')) AS source_name,
    COALESCE(NULLIF(btrim(contacts.source_channel), ''), NULLIF(btrim(lead_sources.channel), '')) AS source_channel,
    NULLIF(btrim(contacts.landing_url), '') AS landing_url,
    NULLIF(btrim(contacts.campaign_name), '') AS campaign_name,
    NULLIF(btrim(contacts.adset_name), '') AS adset_name,
    NULLIF(btrim(contacts.ad_name), '') AS ad_name,
    contacts.owner_user_id AS marketer_id,
    COALESCE(NULLIF(btrim(profiles.full_name), ''), NULLIF(btrim(profiles.username), ''), NULLIF(btrim(profiles.email), '')) AS marketer_name,
    COALESCE(contacts.created_at, '1970-01-01 00:00:00+00'::timestamptz) AS created_at
  FROM public.marketing_contacts contacts
  JOIN public.customers customers
    ON customers.normalized_phone = btrim(contacts.normalized_phone)
  LEFT JOIN public.lead_sources lead_sources
    ON lead_sources.id = contacts.lead_source_id
  LEFT JOIN public.profiles profiles
    ON profiles.id = contacts.owner_user_id
  WHERE NULLIF(btrim(contacts.normalized_phone), '') IS NOT NULL
)
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
FROM source_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customer_sources existing_sources
  WHERE existing_sources.customer_id = source_rows.customer_id
    AND existing_sources.source_channel IS NOT DISTINCT FROM source_rows.source_channel
    AND existing_sources.campaign_name IS NOT DISTINCT FROM source_rows.campaign_name
    AND existing_sources.adset_name IS NOT DISTINCT FROM source_rows.adset_name
    AND existing_sources.ad_name IS NOT DISTINCT FROM source_rows.ad_name
    AND existing_sources.created_at = source_rows.created_at
);

WITH note_rows AS (
  SELECT
    customers.id AS customer_id,
    NULLIF(btrim(notes.content), '') AS note,
    notes.created_by,
    notes.created_by_name,
    COALESCE(notes.created_at, contacts.created_at, '1970-01-01 00:00:00+00'::timestamptz) AS created_at,
    COALESCE(notes.updated_at, notes.created_at, contacts.updated_at, contacts.created_at, '1970-01-01 00:00:00+00'::timestamptz) AS updated_at,
    notes.deleted_at
  FROM public.contact_notes notes
  JOIN public.marketing_contacts contacts
    ON contacts.id = notes.contact_id
  JOIN public.customers customers
    ON customers.normalized_phone = btrim(contacts.normalized_phone)
  WHERE NULLIF(btrim(notes.content), '') IS NOT NULL
),
deduped_note_rows AS (
  SELECT DISTINCT ON (customer_id, note)
    customer_id,
    note,
    created_by,
    created_by_name,
    created_at,
    updated_at,
    deleted_at
  FROM note_rows
  ORDER BY customer_id, note, deleted_at NULLS FIRST, created_at DESC
)
INSERT INTO public.customer_notes (
  customer_id,
  note,
  created_by,
  created_by_name,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  customer_id,
  note,
  created_by,
  created_by_name,
  created_at,
  updated_at,
  deleted_at
FROM deduped_note_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customer_notes existing_notes
  WHERE existing_notes.customer_id = deduped_note_rows.customer_id
    AND btrim(existing_notes.note) = btrim(deduped_note_rows.note)
);

WITH scalar_payload_notes AS (
  SELECT
    contacts.id AS contact_id,
    customers.id AS customer_id,
    NULLIF(btrim(payload_note.content), '') AS note,
    COALESCE(NULLIF(btrim(contacts.sales_owner_name), ''), 'Hệ thống') AS created_by_name,
    COALESCE(contacts.updated_at, contacts.created_at, '1970-01-01 00:00:00+00'::timestamptz) AS created_at
  FROM public.marketing_contacts contacts
  JOIN public.customers customers
    ON customers.normalized_phone = btrim(contacts.normalized_phone)
  CROSS JOIN LATERAL (
    VALUES
      (contacts.raw_payload->>'sale_note'),
      (contacts.raw_payload->>'note'),
      (contacts.raw_payload->>'latest_note')
  ) AS payload_note(content)
),
array_payload_notes AS (
  SELECT
    contacts.id AS contact_id,
    customers.id AS customer_id,
    NULLIF(
      btrim(
        CASE jsonb_typeof(payload_item.value)
          WHEN 'string' THEN payload_item.value #>> '{}'
          WHEN 'object' THEN COALESCE(
            payload_item.value->>'content',
            payload_item.value->>'note',
            payload_item.value->>'message',
            payload_item.value->>'text'
          )
          ELSE NULL
        END
      ),
      ''
    ) AS note,
    COALESCE(
      NULLIF(
        CASE jsonb_typeof(payload_item.value)
          WHEN 'object' THEN COALESCE(
            payload_item.value->>'created_by_name',
            payload_item.value->>'createdByName',
            payload_item.value->>'created_by',
            payload_item.value->>'createdBy'
          )
          ELSE NULL
        END,
        ''
      ),
      NULLIF(btrim(contacts.sales_owner_name), ''),
      'Hệ thống'
    ) AS created_by_name,
    COALESCE(contacts.updated_at, contacts.created_at, '1970-01-01 00:00:00+00'::timestamptz) AS created_at
  FROM public.marketing_contacts contacts
  JOIN public.customers customers
    ON customers.normalized_phone = btrim(contacts.normalized_phone)
  CROSS JOIN LATERAL (
    VALUES
      (contacts.raw_payload->'notes'),
      (contacts.raw_payload->'note_history'),
      (contacts.raw_payload->'sale_notes')
  ) AS payload_arrays(note_array)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(payload_arrays.note_array) = 'array' THEN payload_arrays.note_array
      ELSE '[]'::jsonb
    END
  ) AS payload_item(value)
),
payload_notes AS (
  SELECT * FROM scalar_payload_notes
  UNION ALL
  SELECT * FROM array_payload_notes
),
deduped_payload_notes AS (
  SELECT DISTINCT ON (customer_id, note)
    customer_id,
    note,
    created_by_name,
    created_at
  FROM payload_notes
  WHERE note IS NOT NULL
  ORDER BY customer_id, note, created_at DESC
)
INSERT INTO public.customer_notes (
  customer_id,
  note,
  created_by,
  created_by_name,
  created_at,
  updated_at
)
SELECT
  customer_id,
  note,
  NULL,
  created_by_name,
  created_at,
  created_at
FROM deduped_payload_notes
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customer_notes existing_notes
  WHERE existing_notes.customer_id = deduped_payload_notes.customer_id
    AND btrim(existing_notes.note) = btrim(deduped_payload_notes.note)
);

WITH activity_rows AS (
  SELECT
    customers.id AS customer_id,
    'lead_created'::text AS activity_type,
    'Lead được tạo từ ' || COALESCE(
      NULLIF(btrim(contacts.source_channel), ''),
      NULLIF(btrim(contacts.source_name), ''),
      NULLIF(btrim(lead_sources.channel), ''),
      NULLIF(btrim(lead_sources.name), ''),
      'Nguồn Marketing'
    ) AS description,
    contacts.owner_user_id AS actor_id,
    COALESCE(NULLIF(btrim(profiles.full_name), ''), NULLIF(btrim(profiles.username), ''), NULLIF(btrim(profiles.email), ''), 'Hệ thống') AS actor_name,
    COALESCE(contacts.created_at, '1970-01-01 00:00:00+00'::timestamptz) AS created_at
  FROM public.marketing_contacts contacts
  JOIN public.customers customers
    ON customers.normalized_phone = btrim(contacts.normalized_phone)
  LEFT JOIN public.lead_sources lead_sources
    ON lead_sources.id = contacts.lead_source_id
  LEFT JOIN public.profiles profiles
    ON profiles.id = contacts.owner_user_id

  UNION ALL

  SELECT
    customers.id AS customer_id,
    'assigned_sale'::text AS activity_type,
    'Chia cho NVKD: ' || btrim(contacts.sales_owner_name)
      || CASE
        WHEN NULLIF(btrim(contacts.sales_team_name), '') IS NOT NULL
         AND btrim(contacts.sales_team_name) NOT IN ('Đang tự động chia', 'Chưa phân phối', '—', '-')
        THEN ' - ' || btrim(contacts.sales_team_name)
        ELSE ''
      END AS description,
    NULL::uuid AS actor_id,
    'Hệ thống'::text AS actor_name,
    COALESCE(contacts.updated_at, contacts.created_at, '1970-01-01 00:00:00+00'::timestamptz) AS created_at
  FROM public.marketing_contacts contacts
  JOIN public.customers customers
    ON customers.normalized_phone = btrim(contacts.normalized_phone)
  WHERE NULLIF(btrim(contacts.sales_owner_name), '') IS NOT NULL
    AND btrim(contacts.sales_owner_name) NOT IN ('Đang tự động chia', 'Chưa phân phối', '—', '-')

  UNION ALL

  SELECT
    customers.id AS customer_id,
    'status_changed'::text AS activity_type,
    'Chuyển trạng thái: ' || btrim(contacts.status) AS description,
    NULL::uuid AS actor_id,
    'Hệ thống'::text AS actor_name,
    COALESCE(contacts.updated_at, contacts.created_at, '1970-01-01 00:00:00+00'::timestamptz) AS created_at
  FROM public.marketing_contacts contacts
  JOIN public.customers customers
    ON customers.normalized_phone = btrim(contacts.normalized_phone)
  WHERE NULLIF(btrim(contacts.status), '') IS NOT NULL
    AND btrim(contacts.status) <> 'new'
)
INSERT INTO public.customer_activities (
  customer_id,
  activity_type,
  description,
  actor_id,
  actor_name,
  created_at
)
SELECT
  customer_id,
  activity_type,
  description,
  actor_id,
  actor_name,
  created_at
FROM activity_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customer_activities existing_activities
  WHERE existing_activities.customer_id = activity_rows.customer_id
    AND existing_activities.activity_type = activity_rows.activity_type
    AND existing_activities.description IS NOT DISTINCT FROM activity_rows.description
    AND existing_activities.created_at = activity_rows.created_at
);

-- Verification queries:
-- SELECT count(*) AS customers_count FROM public.customers;
-- SELECT count(*) AS customer_sources_count FROM public.customer_sources;
-- SELECT count(*) AS customer_notes_count FROM public.customer_notes;
-- SELECT count(*) AS customer_activities_count FROM public.customer_activities;

NOTIFY pgrst, 'reload schema';
