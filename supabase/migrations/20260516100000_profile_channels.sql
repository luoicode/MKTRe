CREATE TABLE IF NOT EXISTS public.profile_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_channels_channel_check
    CHECK (channel IN ('facebook', 'tiktok', 'google')),
  CONSTRAINT profile_channels_user_channel_key
    UNIQUE (user_id, channel)
);

ALTER TABLE public.profile_channels ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tr_profile_channels_updated ON public.profile_channels;
CREATE TRIGGER tr_profile_channels_updated
  BEFORE UPDATE ON public.profile_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS profile_channels_self_select ON public.profile_channels;
CREATE POLICY profile_channels_self_select ON public.profile_channels
  FOR SELECT TO authenticated
  USING (
    user_id = public.get_current_profile_id()
    OR public.has_role('admin'::app_role)
  );

DROP POLICY IF EXISTS profile_channels_self_insert ON public.profile_channels;
CREATE POLICY profile_channels_self_insert ON public.profile_channels
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS profile_channels_self_update ON public.profile_channels;
CREATE POLICY profile_channels_self_update ON public.profile_channels
  FOR UPDATE TO authenticated
  USING (user_id = public.get_current_profile_id())
  WITH CHECK (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS profile_channels_self_delete ON public.profile_channels;
CREATE POLICY profile_channels_self_delete ON public.profile_channels
  FOR DELETE TO authenticated
  USING (user_id = public.get_current_profile_id());

CREATE INDEX IF NOT EXISTS idx_profile_channels_user
  ON public.profile_channels(user_id);

NOTIFY pgrst, 'reload schema';
