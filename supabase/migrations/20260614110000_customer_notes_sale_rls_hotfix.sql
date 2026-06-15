-- Allow an assigned Sale profile to manage notes for its own CRM V2 customers.
-- This migration intentionally changes only customer_notes policies.

CREATE OR REPLACE FUNCTION public.crm_v2_sale_can_manage_customer_notes(_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customers customer
    WHERE customer.id = _customer_id
      AND customer.assigned_sale_id = public.get_current_profile_id()
  );
$$;

REVOKE ALL ON FUNCTION public.crm_v2_sale_can_manage_customer_notes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_v2_sale_can_manage_customer_notes(uuid) TO authenticated;

DROP POLICY IF EXISTS customer_notes_assigned_sale_insert ON public.customer_notes;
CREATE POLICY customer_notes_assigned_sale_insert
ON public.customer_notes
FOR INSERT
TO authenticated
WITH CHECK (
  public.crm_v2_sale_can_manage_customer_notes(customer_id)
  AND created_by = public.get_current_profile_id()
  AND deleted_at IS NULL
);

DROP POLICY IF EXISTS customer_notes_assigned_sale_update ON public.customer_notes;
CREATE POLICY customer_notes_assigned_sale_update
ON public.customer_notes
FOR UPDATE
TO authenticated
USING (public.crm_v2_sale_can_manage_customer_notes(customer_id))
WITH CHECK (public.crm_v2_sale_can_manage_customer_notes(customer_id));

-- Notes remain soft-deleted through UPDATE; no DELETE policy is granted to Sale.
