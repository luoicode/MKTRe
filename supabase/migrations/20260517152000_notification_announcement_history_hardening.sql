-- Harden announcement history for Admin/Manager.
-- The bell remains target-based; history is actor-based and grouped in the client by metadata.batch_id.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info';

UPDATE public.notifications
SET
  target_profile_id = COALESCE(target_profile_id, user_id),
  actor_profile_id = COALESCE(actor_profile_id, created_by),
  type = COALESCE(type, kind, 'announcement'),
  scope = COALESCE(scope, NULLIF(target_scope, ''), 'personal'),
  message = COALESCE(message, body),
  metadata = COALESCE(metadata, '{}'::jsonb)
WHERE target_profile_id IS NULL
   OR actor_profile_id IS NULL
   OR type IS NULL
   OR scope IS NULL
   OR message IS NULL
   OR metadata IS NULL;

UPDATE public.notifications
SET metadata =
  COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'batch_id',
    COALESCE(metadata->>'batch_id', id::text),
    'created_by',
    COALESCE(metadata->>'created_by', actor_profile_id::text, created_by::text),
    'audience_type',
    COALESCE(
      metadata->>'audience_type',
      metadata->>'recipient_mode',
      CASE WHEN COALESCE(scope, target_scope) = 'team' THEN 'team' ELSE 'all_users' END
    ),
    'recipient_mode',
    COALESCE(
      metadata->>'recipient_mode',
      CASE WHEN COALESCE(scope, target_scope) = 'team' THEN 'team' ELSE 'all_users' END
    )
  )
WHERE COALESCE(type, kind) = 'announcement';

CREATE INDEX IF NOT EXISTS idx_notifications_actor_announcement_created
  ON public.notifications(actor_profile_id, created_at DESC)
  WHERE COALESCE(type, kind) = 'announcement';

CREATE INDEX IF NOT EXISTS idx_notifications_created_by_announcement_created
  ON public.notifications(created_by, created_at DESC)
  WHERE COALESCE(type, kind) = 'announcement';

DROP POLICY IF EXISTS "notifications_target_select" ON public.notifications;

CREATE POLICY "notifications_target_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    target_profile_id = public.get_current_profile_id()
    OR (
      (
        actor_profile_id = public.get_current_profile_id()
        OR created_by = public.get_current_profile_id()
      )
      AND (
        public.has_role('admin'::public.app_role)
        OR public.has_role('manager'::public.app_role)
      )
    )
  );

NOTIFY pgrst, 'reload schema';
