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
