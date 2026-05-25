ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_event_key_unique
  ON public.notifications(event_key)
  WHERE event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON public.notifications(user_id, is_read, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_in_app_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_event_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notifications (
    user_id,
    target_profile_id,
    type,
    kind,
    title,
    message,
    body,
    entity_type,
    entity_id,
    is_read,
    severity,
    target_scope,
    scope,
    event_key,
    metadata
  )
  VALUES (
    p_user_id,
    p_user_id,
    p_type,
    p_type,
    p_title,
    p_description,
    p_description,
    p_entity_type,
    p_entity_id,
    false,
    'info',
    'personal',
    'personal',
    p_event_key,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (event_key) WHERE event_key IS NOT NULL
  DO UPDATE SET
    title = EXCLUDED.title,
    message = EXCLUDED.message,
    body = EXCLUDED.body,
    metadata = EXCLUDED.metadata,
    created_at = public.notifications.created_at
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
