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
    AND OLD.status IN ('submitted'::public.report_status, 'approved'::public.report_status, 'locked'::public.report_status) THEN
    RAISE EXCEPTION 'Report slot has already been submitted or locked';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_slot_reports_lifecycle_guard ON public.slot_reports;
CREATE TRIGGER tr_slot_reports_lifecycle_guard
BEFORE INSERT OR UPDATE ON public.slot_reports
FOR EACH ROW
EXECUTE FUNCTION public.guard_slot_report_lifecycle();

DROP POLICY IF EXISTS reports_manager_update_assigned ON public.slot_reports;
CREATE POLICY reports_manager_update_assigned ON public.slot_reports
  FOR UPDATE TO authenticated
  USING (public.manager_leads_user(user_id) OR public.manager_leads_team(team_id))
  WITH CHECK (public.manager_leads_user(user_id) OR public.manager_leads_team(team_id));

NOTIFY pgrst, 'reload schema';
