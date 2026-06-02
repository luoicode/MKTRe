CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_code text NOT NULL UNIQUE,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_address text NOT NULL,
  subtotal_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  final_amount numeric NOT NULL DEFAULT 0,
  invoice_image_url text NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  combo_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_created_by_idx ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS invoices_invoice_date_idx ON public.invoices(invoice_date);
CREATE INDEX IF NOT EXISTS invoices_created_at_idx ON public.invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON public.invoice_items(invoice_id);

DROP TRIGGER IF EXISTS invoices_updated_at ON public.invoices;
CREATE TRIGGER invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_admin_all ON public.invoices;
CREATE POLICY invoices_admin_all ON public.invoices
FOR ALL TO authenticated
USING (public.has_role('admin'::public.app_role))
WITH CHECK (public.has_role('admin'::public.app_role));

DROP POLICY IF EXISTS invoice_items_admin_all ON public.invoice_items;
CREATE POLICY invoice_items_admin_all ON public.invoice_items
FOR ALL TO authenticated
USING (public.has_role('admin'::public.app_role))
WITH CHECK (public.has_role('admin'::public.app_role));

DROP POLICY IF EXISTS invoices_sale_self_select ON public.invoices;
CREATE POLICY invoices_sale_self_select ON public.invoices
FOR SELECT TO authenticated
USING (
  created_by = public.get_current_profile_id()
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
);

DROP POLICY IF EXISTS invoices_sale_self_insert ON public.invoices;
CREATE POLICY invoices_sale_self_insert ON public.invoices
FOR INSERT TO authenticated
WITH CHECK (
  created_by = public.get_current_profile_id()
  AND public.is_active_user()
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
);

DROP POLICY IF EXISTS invoice_items_sale_self_select ON public.invoice_items;
CREATE POLICY invoice_items_sale_self_select ON public.invoice_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices invoice
    WHERE invoice.id = invoice_items.invoice_id
      AND invoice.created_by = public.get_current_profile_id()
      AND (
        public.has_role('sale'::public.app_role)
        OR public.has_role('leader_sale'::public.app_role)
      )
  )
);

DROP POLICY IF EXISTS invoice_items_sale_self_insert ON public.invoice_items;
CREATE POLICY invoice_items_sale_self_insert ON public.invoice_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.invoices invoice
    WHERE invoice.id = invoice_items.invoice_id
      AND invoice.created_by = public.get_current_profile_id()
      AND public.is_active_user()
      AND (
        public.has_role('sale'::public.app_role)
        OR public.has_role('leader_sale'::public.app_role)
      )
  )
);

NOTIFY pgrst, 'reload schema';
