DROP POLICY IF EXISTS products_sale_active_select ON public.products;
CREATE POLICY products_sale_active_select ON public.products
FOR SELECT TO authenticated
USING (
  is_active = true
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
);

NOTIFY pgrst, 'reload schema';
