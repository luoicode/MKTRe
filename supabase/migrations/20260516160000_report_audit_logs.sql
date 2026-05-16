-- Audit slot report create/update/reconciliation events without changing report aggregation logic.

CREATE TABLE IF NOT EXISTS public.report_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.slot_reports(id) ON DELETE CASCADE,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('created', 'updated', 'reconciled')),
  old_payload jsonb,
  new_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_audit_logs_report_created
  ON public.report_audit_logs(report_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_audit_logs_action
  ON public.report_audit_logs(action_type);

ALTER TABLE public.report_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.audit_slot_report_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_action text;
  v_is_reconciliation boolean;
BEGIN
  SELECT p.id
  INTO v_actor_id
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;

  v_actor_id := COALESCE(v_actor_id, NEW.user_id);

  SELECT EXISTS (
    SELECT 1
    FROM public.report_slots rs
    WHERE rs.id = NEW.slot_id
      AND (rs.slot_name = '13h55' OR rs.slot_time = '13:55')
  )
  INTO v_is_reconciliation;

  IF v_is_reconciliation THEN
    v_action := 'reconciled';
  ELSIF TG_OP = 'INSERT' THEN
    v_action := 'created';
  ELSE
    v_action := 'updated';
  END IF;

  INSERT INTO public.report_audit_logs (
    report_id,
    actor_profile_id,
    action_type,
    old_payload,
    new_payload
  )
  VALUES (
    NEW.id,
    v_actor_id,
    v_action,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_slot_reports_audit ON public.slot_reports;
CREATE TRIGGER tr_slot_reports_audit
AFTER INSERT OR UPDATE ON public.slot_reports
FOR EACH ROW
EXECUTE FUNCTION public.audit_slot_report_change();

DROP POLICY IF EXISTS "report_audit_logs_admin_all" ON public.report_audit_logs;
CREATE POLICY "report_audit_logs_admin_all"
ON public.report_audit_logs
FOR ALL
TO authenticated
USING (public.has_role('admin'::public.app_role))
WITH CHECK (public.has_role('admin'::public.app_role));

DROP POLICY IF EXISTS "report_audit_logs_self_select" ON public.report_audit_logs;
CREATE POLICY "report_audit_logs_self_select"
ON public.report_audit_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.slot_reports sr
    WHERE sr.id = report_audit_logs.report_id
      AND sr.user_id = public.get_current_profile_id()
  )
);

DROP POLICY IF EXISTS "report_audit_logs_leader_team_select" ON public.report_audit_logs;
CREATE POLICY "report_audit_logs_leader_team_select"
ON public.report_audit_logs
FOR SELECT
TO authenticated
USING (
  public.has_role('leader'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.slot_reports sr
    JOIN public.team_memberships tm
      ON tm.team_id = sr.team_id
     AND tm.user_id = public.get_current_profile_id()
     AND tm.is_active = true
    WHERE sr.id = report_audit_logs.report_id
  )
);

DROP POLICY IF EXISTS "report_audit_logs_manager_team_select" ON public.report_audit_logs;
CREATE POLICY "report_audit_logs_manager_team_select"
ON public.report_audit_logs
FOR SELECT
TO authenticated
USING (
  public.has_role('manager'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.slot_reports sr
    JOIN public.manager_team_assignments mta
      ON mta.team_id = sr.team_id
     AND mta.manager_id = public.get_current_profile_id()
     AND mta.is_active = true
    WHERE sr.id = report_audit_logs.report_id
  )
);

NOTIFY pgrst, 'reload schema';
