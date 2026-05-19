CREATE TABLE IF NOT EXISTS public.group_reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_type text NOT NULL,
  reminder_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  telegram_chat_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_reminder_logs_type_created
  ON public.group_reminder_logs(reminder_type, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_reminder_logs_sent_dedupe
  ON public.group_reminder_logs(reminder_key)
  WHERE status = 'sent';

ALTER TABLE public.group_reminder_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS group_reminder_logs_admin_manager_select ON public.group_reminder_logs;
CREATE POLICY group_reminder_logs_admin_manager_select ON public.group_reminder_logs
FOR SELECT TO authenticated
USING (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
);

NOTIFY pgrst, 'reload schema';
