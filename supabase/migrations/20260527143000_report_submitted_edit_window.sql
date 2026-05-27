CREATE OR REPLACE FUNCTION public.guard_slot_report_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role('admin'::public.app_role)
    OR public.has_role('manager'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('draft'::public.report_status, 'submitted'::public.report_status) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status IN ('approved'::public.report_status, 'locked'::public.report_status) THEN
    RAISE EXCEPTION 'Report slot has already been submitted or locked';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'submitted'::public.report_status THEN
    IF OLD.submitted_at IS NULL OR OLD.submitted_at < now() - interval '2 hours' THEN
      RAISE EXCEPTION 'Report slot has already been submitted or locked';
    END IF;

    IF NEW.status <> 'submitted'::public.report_status THEN
      RAISE EXCEPTION 'Report slot has already been submitted or locked';
    END IF;

    NEW.submitted_at := OLD.submitted_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS sale_reports_self_update ON public.sale_reports;
CREATE POLICY sale_reports_self_update ON public.sale_reports
FOR UPDATE TO authenticated
USING (
  user_id = public.get_current_profile_id()
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
  AND (
    status = 'draft'
    OR (
      status = 'submitted'
      AND submitted_at IS NOT NULL
      AND submitted_at >= now() - interval '2 hours'
    )
  )
)
WITH CHECK (
  user_id = public.get_current_profile_id()
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
  AND public.is_active_user()
  AND status IN ('draft', 'submitted')
);

NOTIFY pgrst, 'reload schema';
