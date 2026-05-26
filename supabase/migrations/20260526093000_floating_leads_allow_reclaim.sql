CREATE OR REPLACE FUNCTION public.guard_floating_leads_sale_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id uuid := public.get_current_profile_id();
  current_call_slot integer := CASE
    WHEN NULLIF(BTRIM(COALESCE(OLD.call_1, '')), '') IS NULL THEN 1
    WHEN NULLIF(BTRIM(COALESCE(OLD.call_2, '')), '') IS NULL THEN 2
    WHEN NULLIF(BTRIM(COALESCE(OLD.call_3, '')), '') IS NULL THEN 3
    ELSE 4
  END;
BEGIN
  IF current_setting('app.releasing_floating_leads', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  ) AND NOT (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role)) THEN
    IF OLD.is_closed THEN
      RAISE EXCEPTION 'Lead already closed';
    END IF;

    IF NEW.phone IS DISTINCT FROM OLD.phone
      OR NEW.source IS DISTINCT FROM OLD.source
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_by_name IS DISTINCT FROM OLD.created_by_name
      OR NEW.lead_date IS DISTINCT FROM OLD.lead_date
      OR NEW.claim_count IS DISTINCT FROM OLD.claim_count
      OR NEW.blocked_sale_ids IS DISTINCT FROM OLD.blocked_sale_ids THEN
      RAISE EXCEPTION 'Sale cannot update lead source fields';
    END IF;

    IF OLD.assigned_sale_id IS NOT NULL
      AND OLD.assigned_sale_id <> current_profile_id THEN
      RAISE EXCEPTION 'Lead already assigned';
    END IF;

    IF OLD.assigned_sale_id IS NULL THEN
      IF OLD.claim_count >= 3 THEN
        RAISE EXCEPTION 'Lead already processed 3 times';
      END IF;

      IF NEW.assigned_sale_id <> current_profile_id THEN
        RAISE EXCEPTION 'Sale can only claim for self';
      END IF;

      IF NEW.call_1 IS DISTINCT FROM OLD.call_1
        OR NEW.call_2 IS DISTINCT FROM OLD.call_2
        OR NEW.call_3 IS DISTINCT FROM OLD.call_3
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.note IS DISTINCT FROM OLD.note
        OR NEW.is_closed IS DISTINCT FROM OLD.is_closed
        OR NEW.closed_by IS DISTINCT FROM OLD.closed_by
        OR NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
        RAISE EXCEPTION 'Sale can only claim lead at this step';
      END IF;
    END IF;

    IF OLD.assigned_sale_id IS NOT NULL
      AND NEW.assigned_sale_id IS DISTINCT FROM OLD.assigned_sale_id THEN
      RAISE EXCEPTION 'Cannot reassign claimed lead';
    END IF;

    IF OLD.assigned_sale_id IS NOT NULL THEN
      IF current_call_slot = 1
        AND (NEW.call_2 IS DISTINCT FROM OLD.call_2 OR NEW.call_3 IS DISTINCT FROM OLD.call_3) THEN
        RAISE EXCEPTION 'Sale can only update call 1 for this lead';
      END IF;

      IF current_call_slot = 2
        AND (NEW.call_1 IS DISTINCT FROM OLD.call_1 OR NEW.call_3 IS DISTINCT FROM OLD.call_3) THEN
        RAISE EXCEPTION 'Sale can only update call 2 for this lead';
      END IF;

      IF current_call_slot = 3
        AND (NEW.call_1 IS DISTINCT FROM OLD.call_1 OR NEW.call_2 IS DISTINCT FROM OLD.call_2) THEN
        RAISE EXCEPTION 'Sale can only update call 3 for this lead';
      END IF;

      IF current_call_slot = 4
        AND (NEW.call_1 IS DISTINCT FROM OLD.call_1
          OR NEW.call_2 IS DISTINCT FROM OLD.call_2
          OR NEW.call_3 IS DISTINCT FROM OLD.call_3) THEN
        RAISE EXCEPTION 'Lead already has 3 call notes';
      END IF;
    END IF;

    IF NEW.is_closed THEN
      IF OLD.assigned_sale_id <> current_profile_id THEN
        RAISE EXCEPTION 'Only assigned sale can close lead';
      END IF;

      IF NEW.closed_by IS DISTINCT FROM current_profile_id THEN
        RAISE EXCEPTION 'Invalid closed_by';
      END IF;

      IF NEW.closed_at IS NULL THEN
        RAISE EXCEPTION 'closed_at is required';
      END IF;
    ELSE
      IF NEW.closed_by IS DISTINCT FROM OLD.closed_by
        OR NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
        RAISE EXCEPTION 'Invalid close fields';
      END IF;
    END IF;
  END IF;

  IF public.has_role('employee'::public.app_role) AND NOT (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role)) THEN
    IF OLD.created_by <> current_profile_id THEN
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
      OR NEW.note IS DISTINCT FROM OLD.note
      OR NEW.claim_count IS DISTINCT FROM OLD.claim_count
      OR NEW.blocked_sale_ids IS DISTINCT FROM OLD.blocked_sale_ids
      OR NEW.last_claimed_at IS DISTINCT FROM OLD.last_claimed_at
      OR NEW.closed_by IS DISTINCT FROM OLD.closed_by
      OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
      OR NEW.is_closed IS DISTINCT FROM OLD.is_closed THEN
      RAISE EXCEPTION 'Marketing can only update lead source fields before assignment';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
