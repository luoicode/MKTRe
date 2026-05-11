
CREATE OR REPLACE FUNCTION public.fill_report_team_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.team_id IS NULL THEN
    SELECT team_id INTO NEW.team_id
    FROM public.team_memberships
    WHERE user_id = NEW.user_id AND is_active = true
    ORDER BY start_date DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_slot_reports_fill_team
BEFORE INSERT OR UPDATE ON public.slot_reports
FOR EACH ROW EXECUTE FUNCTION public.fill_report_team_id();
