CREATE TABLE IF NOT EXISTS public.telegram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  telegram_chat_id text NOT NULL,
  telegram_user_id text,
  telegram_username text,
  is_active boolean NOT NULL DEFAULT true,
  linked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telegram_accounts_profile_id_key UNIQUE (profile_id),
  CONSTRAINT telegram_accounts_chat_id_key UNIQUE (telegram_chat_id)
);

CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.telegram_notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  recipient_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  telegram_chat_id text,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error text,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_profile_active
  ON public.telegram_link_codes(profile_id, expires_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_notification_logs_notification
  ON public.telegram_notification_logs(notification_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_notification_logs_dedupe_sent
  ON public.telegram_notification_logs(dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status = 'sent';

DROP TRIGGER IF EXISTS tr_telegram_accounts_updated ON public.telegram_accounts;
CREATE TRIGGER tr_telegram_accounts_updated
  BEFORE UPDATE ON public.telegram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_accounts_select_scope" ON public.telegram_accounts;
CREATE POLICY "telegram_accounts_select_scope" ON public.telegram_accounts
FOR SELECT TO authenticated
USING (
  profile_id = public.get_current_profile_id()
  OR public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
);

DROP POLICY IF EXISTS "telegram_accounts_update_own" ON public.telegram_accounts;
CREATE POLICY "telegram_accounts_update_own" ON public.telegram_accounts
FOR UPDATE TO authenticated
USING (profile_id = public.get_current_profile_id())
WITH CHECK (profile_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "telegram_link_codes_select_own" ON public.telegram_link_codes;
CREATE POLICY "telegram_link_codes_select_own" ON public.telegram_link_codes
FOR SELECT TO authenticated
USING (profile_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "telegram_link_codes_insert_own" ON public.telegram_link_codes;
CREATE POLICY "telegram_link_codes_insert_own" ON public.telegram_link_codes
FOR INSERT TO authenticated
WITH CHECK (profile_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "telegram_notification_logs_select_scope" ON public.telegram_notification_logs;
CREATE POLICY "telegram_notification_logs_select_scope" ON public.telegram_notification_logs
FOR SELECT TO authenticated
USING (
  recipient_profile_id = public.get_current_profile_id()
  OR public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
);

NOTIFY pgrst, 'reload schema';
