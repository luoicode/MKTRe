-- Permit Sale users to manage orders only for CRM V2 customers they can access.
-- Existing Admin/Manager and customer-scoped SELECT policies remain intact.

DROP POLICY IF EXISTS customer_orders_assigned_sale_select ON public.customer_orders;
CREATE POLICY customer_orders_assigned_sale_select
ON public.customer_orders
FOR SELECT
TO authenticated
USING (
  public.has_role('sale'::public.app_role)
  AND public.crm_v2_can_access_customer(customer_id)
);

DROP POLICY IF EXISTS customer_orders_assigned_sale_insert ON public.customer_orders;
CREATE POLICY customer_orders_assigned_sale_insert
ON public.customer_orders
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role('sale'::public.app_role)
  AND public.crm_v2_can_access_customer(customer_id)
);

DROP POLICY IF EXISTS customer_orders_assigned_sale_update ON public.customer_orders;
CREATE POLICY customer_orders_assigned_sale_update
ON public.customer_orders
FOR UPDATE
TO authenticated
USING (
  public.has_role('sale'::public.app_role)
  AND public.crm_v2_can_access_customer(customer_id)
)
WITH CHECK (
  public.has_role('sale'::public.app_role)
  AND public.crm_v2_can_access_customer(customer_id)
);
