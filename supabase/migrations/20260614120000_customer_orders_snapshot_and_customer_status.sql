-- Persist the complete Sale quote/order form and allow the assigned Sale to
-- update the CRM customer that they already have access to.

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS order_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP POLICY IF EXISTS customers_assigned_sale_update ON public.customers;
CREATE POLICY customers_assigned_sale_update
ON public.customers
FOR UPDATE
TO authenticated
USING (
  public.has_role('sale'::public.app_role)
  AND public.crm_v2_can_access_customer(id)
)
WITH CHECK (
  public.has_role('sale'::public.app_role)
  AND public.crm_v2_can_access_customer(id)
);

-- Repair customers left at the initial status by older quote/order flows.
WITH latest_orders AS (
  SELECT DISTINCT ON (orders.customer_id)
    orders.customer_id,
    lower(trim(orders.status)) AS normalized_status
  FROM public.customer_orders orders
  ORDER BY
    orders.customer_id,
    COALESCE(orders.order_date, orders.created_at) DESC,
    orders.created_at DESC
)
UPDATE public.customers customers
SET
  status = CASE
    WHEN latest_orders.normalized_status IN (
      'processing',
      'đang xử lí',
      'đang xử lý',
      'đang_xử_lí',
      'dang_xu_ly'
    ) THEN 'processing'
    WHEN latest_orders.normalized_status IN (
      'quoted',
      'quote',
      'draft',
      'báo giá',
      'báo_giá',
      'bao_gia'
    ) THEN 'quoted'
    ELSE customers.status
  END,
  updated_at = now()
FROM latest_orders
WHERE customers.id = latest_orders.customer_id
  AND lower(trim(COALESCE(customers.status, 'new'))) IN ('new', 'sale_received')
  AND latest_orders.normalized_status IN (
    'processing',
    'đang xử lí',
    'đang xử lý',
    'đang_xử_lí',
    'dang_xu_ly',
    'quoted',
    'quote',
    'draft',
    'báo giá',
    'báo_giá',
    'bao_gia'
  );

COMMENT ON COLUMN public.customer_orders.order_snapshot IS
  'Complete Sale quote/order form snapshot used to restore the order editor.';
