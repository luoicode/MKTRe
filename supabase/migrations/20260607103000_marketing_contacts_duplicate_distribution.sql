ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS duplicate_of_contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS eligible_for_sale_distribution boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_duplicate_of
ON public.marketing_contacts(duplicate_of_contact_id);

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_distribution_queue
ON public.marketing_contacts(eligible_for_sale_distribution, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_phone_recent_status
ON public.marketing_contacts(normalized_phone, created_at DESC, status);

UPDATE public.marketing_contacts
SET
  duplicate_checked_at = COALESCE(duplicate_checked_at, created_at),
  eligible_for_sale_distribution = NOT COALESCE(is_duplicate, false)
WHERE duplicate_checked_at IS NULL
   OR eligible_for_sale_distribution IS DISTINCT FROM NOT COALESCE(is_duplicate, false);

NOTIFY pgrst, 'reload schema';
