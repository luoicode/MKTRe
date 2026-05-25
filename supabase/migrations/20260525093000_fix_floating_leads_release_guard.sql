CREATE OR REPLACE FUNCTION public.guard_floating_leads_sale_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id uuid := public.get_current_profile_id();
  current_call_slot integer := LEAST(GREATEST(OLD.claim_count + 1, 1), 3);
BEGIN
  IF current_setting('app.releasing_floating_leads', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF public.has_role('sale') AND NOT (public.has_role('admin') OR public.has_role('manager')) THEN
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

      IF current_profile_id = ANY(OLD.blocked_sale_ids) THEN
        RAISE EXCEPTION 'You have processed this lead before';
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

      IF NEW.note IS DISTINCT FROM OLD.note THEN
        RAISE EXCEPTION 'Sale cannot update shared note';
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

  IF public.has_role('employee') AND NOT (public.has_role('admin') OR public.has_role('manager')) THEN
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

CREATE OR REPLACE FUNCTION public.release_expired_floating_leads_for_sale(p_sale_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  released_count integer := 0;
  today_start timestamptz := (((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
BEGIN
  IF NOT public.has_role('sale') OR p_sale_id <> public.get_current_profile_id() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  PERFORM set_config('app.releasing_floating_leads', 'true', true);

  UPDATE public.floating_leads
  SET
    blocked_sale_ids = CASE
      WHEN assigned_sale_id = ANY(blocked_sale_ids) THEN blocked_sale_ids
      ELSE array_append(blocked_sale_ids, assigned_sale_id)
    END,
    assigned_sale_id = NULL,
    assigned_sale_name = NULL,
    assigned_at = NULL,
    claim_count = claim_count + 1,
    updated_at = now()
  WHERE assigned_sale_id IS NOT NULL
    AND is_closed = false
    AND assigned_at IS NOT NULL
    AND assigned_at < today_start;

  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
