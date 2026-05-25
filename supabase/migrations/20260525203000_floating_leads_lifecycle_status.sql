ALTER TABLE public.floating_leads
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'new';

ALTER TABLE public.floating_leads
  DROP CONSTRAINT IF EXISTS floating_leads_lifecycle_status_check;

ALTER TABLE public.floating_leads
  ADD CONSTRAINT floating_leads_lifecycle_status_check
  CHECK (
    lifecycle_status IN (
      'new',
      'claimed',
      'called_1',
      'called_2',
      'called_3',
      'closed',
      'released',
      'expired'
    )
  );

CREATE OR REPLACE FUNCTION public.derive_floating_lead_lifecycle(
  _assigned_sale_id uuid,
  _is_closed boolean,
  _call_1 text,
  _call_2 text,
  _call_3 text,
  _claim_count integer,
  _assigned_at timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN COALESCE(_is_closed, false) THEN 'closed'
    WHEN NULLIF(BTRIM(COALESCE(_call_3, '')), '') IS NOT NULL THEN 'called_3'
    WHEN NULLIF(BTRIM(COALESCE(_call_2, '')), '') IS NOT NULL THEN 'called_2'
    WHEN NULLIF(BTRIM(COALESCE(_call_1, '')), '') IS NOT NULL THEN 'called_1'
    WHEN _assigned_sale_id IS NOT NULL THEN 'claimed'
    WHEN COALESCE(_claim_count, 0) > 0 THEN 'released'
    WHEN _assigned_at IS NOT NULL AND _assigned_at < date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN 'expired'
    ELSE 'new'
  END;
$$;

CREATE OR REPLACE FUNCTION public.sync_floating_lead_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.lifecycle_status := public.derive_floating_lead_lifecycle(
    NEW.assigned_sale_id,
    NEW.is_closed,
    NEW.call_1,
    NEW.call_2,
    NEW.call_3,
    NEW.claim_count,
    NEW.assigned_at
  );
  RETURN NEW;
END;
$$;

UPDATE public.floating_leads
SET lifecycle_status = public.derive_floating_lead_lifecycle(
  assigned_sale_id,
  is_closed,
  call_1,
  call_2,
  call_3,
  claim_count,
  assigned_at
);

CREATE INDEX IF NOT EXISTS idx_floating_leads_lifecycle_status
  ON public.floating_leads(lifecycle_status);

DROP TRIGGER IF EXISTS tr_sync_floating_lead_lifecycle ON public.floating_leads;
CREATE TRIGGER tr_sync_floating_lead_lifecycle
  BEFORE INSERT OR UPDATE OF assigned_sale_id, is_closed, call_1, call_2, call_3, claim_count, assigned_at
  ON public.floating_leads
  FOR EACH ROW EXECUTE FUNCTION public.sync_floating_lead_lifecycle();

NOTIFY pgrst, 'reload schema';
