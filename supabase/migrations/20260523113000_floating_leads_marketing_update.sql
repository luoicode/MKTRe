CREATE OR REPLACE FUNCTION public.guard_floating_leads_sale_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role('sale') AND NOT (public.has_role('admin') OR public.has_role('manager')) THEN
    IF NEW.phone IS DISTINCT FROM OLD.phone
      OR NEW.source IS DISTINCT FROM OLD.source
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_by_name IS DISTINCT FROM OLD.created_by_name
      OR NEW.lead_date IS DISTINCT FROM OLD.lead_date THEN
      RAISE EXCEPTION 'Sale cannot update lead source fields';
    END IF;

    IF OLD.assigned_sale_id IS NOT NULL
      AND OLD.assigned_sale_id <> public.get_current_profile_id() THEN
      RAISE EXCEPTION 'Lead already assigned';
    END IF;

    IF OLD.assigned_sale_id IS NULL
      AND NEW.assigned_sale_id <> public.get_current_profile_id() THEN
      RAISE EXCEPTION 'Sale can only claim for self';
    END IF;

    IF OLD.assigned_sale_id IS NOT NULL
      AND NEW.assigned_sale_id IS DISTINCT FROM OLD.assigned_sale_id THEN
      RAISE EXCEPTION 'Cannot reassign claimed lead';
    END IF;
  END IF;

  IF public.has_role('employee') AND NOT (public.has_role('admin') OR public.has_role('manager')) THEN
    IF OLD.created_by <> public.get_current_profile_id() THEN
      RAISE EXCEPTION 'Marketing can only update own leads';
    END IF;

    IF OLD.assigned_sale_id IS NOT NULL THEN
      RAISE EXCEPTION 'Lead already assigned';
    END IF;

    IF NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_by_name IS DISTINCT FROM OLD.created_by_name
      OR NEW.assigned_sale_id IS DISTINCT FROM OLD.assigned_sale_id
      OR NEW.assigned_sale_name IS DISTINCT FROM OLD.assigned_sale_name
      OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
      OR NEW.call_1 IS DISTINCT FROM OLD.call_1
      OR NEW.call_2 IS DISTINCT FROM OLD.call_2
      OR NEW.call_3 IS DISTINCT FROM OLD.call_3
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.note IS DISTINCT FROM OLD.note THEN
      RAISE EXCEPTION 'Marketing can only update lead source fields before assignment';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS floating_leads_marketing_update_own_unassigned ON public.floating_leads;
CREATE POLICY floating_leads_marketing_update_own_unassigned ON public.floating_leads
FOR UPDATE TO authenticated
USING (
  created_by = public.get_current_profile_id()
  AND assigned_sale_id IS NULL
  AND public.has_role('employee')
  AND public.is_active_user()
)
WITH CHECK (
  created_by = public.get_current_profile_id()
  AND assigned_sale_id IS NULL
  AND public.has_role('employee')
  AND public.is_active_user()
);

NOTIFY pgrst, 'reload schema';
