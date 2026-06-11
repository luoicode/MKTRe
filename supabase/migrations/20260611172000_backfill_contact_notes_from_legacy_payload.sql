WITH scalar_notes AS (
  SELECT
    contacts.id AS contact_id,
    NULLIF(btrim(source.content), '') AS content,
    NULLIF(contacts.sales_owner_name, '') AS created_by_name,
    COALESCE(contacts.updated_at, contacts.created_at, now()) AS created_at
  FROM public.marketing_contacts contacts
  CROSS JOIN LATERAL (
    VALUES
      (contacts.raw_payload->>'sale_note'),
      (contacts.raw_payload->>'note'),
      (contacts.raw_payload->>'latest_note')
  ) AS source(content)
),
array_notes AS (
  SELECT
    contacts.id AS contact_id,
    NULLIF(
      btrim(
        CASE jsonb_typeof(item.value)
          WHEN 'string' THEN item.value #>> '{}'
          WHEN 'object' THEN COALESCE(
            item.value->>'content',
            item.value->>'note',
            item.value->>'message',
            item.value->>'text'
          )
          ELSE NULL
        END
      ),
      ''
    ) AS content,
    NULLIF(
      CASE jsonb_typeof(item.value)
        WHEN 'object' THEN COALESCE(
          item.value->>'created_by_name',
          item.value->>'createdByName',
          item.value->>'created_by',
          item.value->>'createdBy'
        )
        ELSE NULL
      END,
      ''
    ) AS created_by_name,
    COALESCE(contacts.updated_at, contacts.created_at, now()) AS created_at
  FROM public.marketing_contacts contacts
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
  ) AS item(value)
),
legacy_notes AS (
  SELECT * FROM scalar_notes
  UNION ALL
  SELECT * FROM array_notes
),
deduped_notes AS (
  SELECT DISTINCT ON (contact_id, content)
    contact_id,
    content,
    created_by_name,
    created_at
  FROM legacy_notes
  WHERE content IS NOT NULL
  ORDER BY contact_id, content, created_at DESC
)
INSERT INTO public.contact_notes (
  contact_id,
  content,
  created_by,
  created_by_name,
  created_at,
  updated_at
)
SELECT
  notes.contact_id,
  notes.content,
  NULL,
  COALESCE(notes.created_by_name, NULLIF(contacts.sales_owner_name, ''), 'Hệ thống'),
  notes.created_at,
  notes.created_at
FROM deduped_notes notes
JOIN public.marketing_contacts contacts ON contacts.id = notes.contact_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.contact_notes existing_notes
  WHERE existing_notes.contact_id = notes.contact_id
    AND btrim(existing_notes.content) = btrim(notes.content)
    AND existing_notes.deleted_at IS NULL
);

NOTIFY pgrst, 'reload schema';
