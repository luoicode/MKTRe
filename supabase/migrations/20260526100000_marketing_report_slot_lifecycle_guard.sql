CREATE OR REPLACE FUNCTION public.is_previous_day_report_slot(_slot public.report_slots)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT _slot.slot_name ILIKE '%13%' OR _slot.slot_time::text LIKE '13:%';
$$;

CREATE OR REPLACE FUNCTION public.guard_slot_report_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id uuid := public.get_current_profile_id();
  current_slot public.report_slots%ROWTYPE;
  previous_slot_id uuid;
  previous_completed boolean := true;
  effective_due_at timestamptz;
  is_admin_or_manager boolean := public.has_role('admin'::public.app_role)
    OR public.has_role('manager'::public.app_role);
BEGIN
  IF is_admin_or_manager THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('draft'::public.report_status, 'submitted'::public.report_status) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IN ('submitted'::public.report_status, 'approved'::public.report_status, 'locked'::public.report_status) THEN
    RAISE EXCEPTION 'Report slot has already been submitted or locked';
  END IF;

  SELECT *
  INTO current_slot
  FROM public.report_slots
  WHERE id = NEW.slot_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report slot is invalid or inactive';
  END IF;

  effective_due_at := (
    (
      NEW.report_date
      + CASE
          WHEN public.is_previous_day_report_slot(current_slot) THEN 1
          ELSE 0
        END
    )::timestamp
    + current_slot.slot_time
  ) AT TIME ZONE 'Asia/Ho_Chi_Minh';

  IF now() < effective_due_at - interval '1 hour' THEN
    RAISE EXCEPTION 'Report slot is not open yet';
  END IF;

  IF now() > effective_due_at + interval '1 hour' THEN
    RAISE EXCEPTION 'Report slot has expired';
  END IF;

  IF NOT public.is_previous_day_report_slot(current_slot) THEN
    SELECT rs.id
    INTO previous_slot_id
    FROM public.report_slots rs
    WHERE rs.is_active = true
      AND rs.sort_order < current_slot.sort_order
      AND NOT public.is_previous_day_report_slot(rs)
    ORDER BY rs.sort_order DESC
    LIMIT 1;

    IF previous_slot_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.slot_reports sr
        WHERE sr.user_id = NEW.user_id
          AND sr.report_date = NEW.report_date
          AND sr.slot_id = previous_slot_id
          AND sr.status IN ('submitted'::public.report_status, 'approved'::public.report_status)
      )
      INTO previous_completed;

      IF NOT previous_completed THEN
        RAISE EXCEPTION 'Previous report slot must be submitted first';
      END IF;
    END IF;
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
