-- Keep legacy target_scope compatible with the target-based notification model.
-- New code uses scope; target_scope remains only for older rows/functions.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_target_scope_check;

ALTER TABLE public.notifications
  ALTER COLUMN target_scope SET DEFAULT 'personal';

UPDATE public.notifications
SET target_scope = CASE
  WHEN COALESCE(scope, '') IN ('system', 'team', 'personal') THEN scope
  WHEN target_scope = 'all' THEN 'system'
  WHEN target_scope = 'user' THEN 'personal'
  WHEN target_scope = 'team' THEN 'team'
  ELSE 'personal'
END
WHERE target_scope IS NULL
   OR target_scope NOT IN ('system', 'team', 'personal')
   OR (scope IS NOT NULL AND scope <> target_scope);

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_target_scope_check
  CHECK (target_scope IN ('system', 'team', 'personal'));

NOTIFY pgrst, 'reload schema';
