ALTER TABLE public.sale_reports
  ADD COLUMN IF NOT EXISTS old_customer_call_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_call_data_count integer NOT NULL DEFAULT 0;

UPDATE public.sale_reports
SET old_customer_call_count = old_customers
WHERE old_customer_call_count = 0
  AND old_customers <> 0;

NOTIFY pgrst, 'reload schema';
