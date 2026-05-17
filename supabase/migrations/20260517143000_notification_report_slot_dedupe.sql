-- Prevent duplicate report slot reminder notifications for the same user/day/slot/type.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        target_profile_id,
        type,
        metadata ->> 'report_date',
        COALESCE(metadata ->> 'slot_id', metadata ->> 'slot_time')
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.notifications
  WHERE type IN ('report_slot_due', 'report_slot_overdue')
    AND metadata ? 'report_date'
    AND (metadata ? 'slot_id' OR metadata ? 'slot_time')
)
DELETE FROM public.notifications n
USING ranked r
WHERE n.id = r.id
  AND r.rn > 1;

UPDATE public.notifications
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{dedupe_key}',
  to_jsonb(
    type || ':' ||
    target_profile_id::text || ':' ||
    (metadata ->> 'report_date') || ':' ||
    COALESCE(metadata ->> 'slot_id', metadata ->> 'slot_time')
  ),
  true
)
WHERE type IN ('report_slot_due', 'report_slot_overdue')
  AND metadata ? 'report_date'
  AND (metadata ? 'slot_id' OR metadata ? 'slot_time')
  AND NOT metadata ? 'dedupe_key';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_report_slot_dedupe
ON public.notifications (
  target_profile_id,
  type,
  ((metadata ->> 'dedupe_key'))
)
WHERE type IN ('report_slot_due', 'report_slot_overdue')
  AND metadata ? 'dedupe_key';

NOTIFY pgrst, 'reload schema';
