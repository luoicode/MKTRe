CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  product_group text NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'hũ',
  price_before_tax numeric NOT NULL DEFAULT 0,
  base_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  price_after_discount numeric NOT NULL DEFAULT 0,
  final_price_after_discount numeric NOT NULL DEFAULT 0,
  gift text NULL,
  next_voucher text NULL,
  image_url text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_parent_id_idx ON public.products(parent_id);
CREATE INDEX IF NOT EXISTS products_product_group_idx ON public.products(product_group);
CREATE INDEX IF NOT EXISTS products_is_active_idx ON public.products(is_active);
CREATE INDEX IF NOT EXISTS products_sort_order_idx ON public.products(sort_order);

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_admin_select ON public.products;
CREATE POLICY products_admin_select ON public.products
FOR SELECT TO authenticated
USING (public.has_role('admin'::public.app_role));

DROP POLICY IF EXISTS products_admin_insert ON public.products;
CREATE POLICY products_admin_insert ON public.products
FOR INSERT TO authenticated
WITH CHECK (public.has_role('admin'::public.app_role));

DROP POLICY IF EXISTS products_admin_update ON public.products;
CREATE POLICY products_admin_update ON public.products
FOR UPDATE TO authenticated
USING (public.has_role('admin'::public.app_role))
WITH CHECK (public.has_role('admin'::public.app_role));

DROP POLICY IF EXISTS products_admin_delete ON public.products;
CREATE POLICY products_admin_delete ON public.products
FOR DELETE TO authenticated
USING (public.has_role('admin'::public.app_role));

DO $$
DECLARE
  v_notrigold uuid;
  v_notrigrowth uuid;
  v_notri_allicin uuid;
BEGIN
  INSERT INTO public.products (
    name, product_group, quantity, unit, sort_order, gift, next_voucher
  )
  SELECT 'Notrigold', 'Notrigold', 0, '', 10, 'Không áp dụng', 'Không áp dụng'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.products WHERE parent_id IS NULL AND name = 'Notrigold'
  )
  RETURNING id INTO v_notrigold;

  IF v_notrigold IS NULL THEN
    SELECT id INTO v_notrigold
    FROM public.products
    WHERE parent_id IS NULL AND name = 'Notrigold'
    ORDER BY created_at
    LIMIT 1;
  END IF;

  INSERT INTO public.products (
    name, product_group, quantity, unit, sort_order, gift, next_voucher
  )
  SELECT 'Notrigrowth', 'Notrigrowth', 0, '', 20, 'Không áp dụng', 'Không áp dụng'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.products WHERE parent_id IS NULL AND name = 'Notrigrowth'
  )
  RETURNING id INTO v_notrigrowth;

  INSERT INTO public.products (
    name, product_group, quantity, unit, sort_order, gift, next_voucher
  )
  SELECT 'Notri Allicin', 'Notri Allicin', 0, '', 30, 'Không áp dụng', 'Không áp dụng'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.products WHERE parent_id IS NULL AND name = 'Notri Allicin'
  )
  RETURNING id INTO v_notri_allicin;

  INSERT INTO public.products (
    parent_id,
    name,
    product_group,
    quantity,
    unit,
    price_before_tax,
    base_price,
    discount_percent,
    price_after_discount,
    final_price_after_discount,
    gift,
    next_voucher,
    sort_order
  )
  SELECT
    v_notrigold,
    item.name,
    'Notrigold',
    item.quantity,
    item.unit,
    item.price_before_tax,
    item.base_price,
    item.discount_percent,
    item.price_after_discount,
    item.final_price_after_discount,
    item.gift,
    item.next_voucher,
    item.sort_order
  FROM (
    VALUES
      ('1 hũ Notrigold', 1::numeric, 'hũ', 390000::numeric, 390000::numeric, 0::numeric, 390000::numeric, 390000::numeric, 'Không áp dụng', 'Không áp dụng', 11),
      ('Combo 2 hũ Notrigold', 2::numeric, 'hũ', 780000::numeric, 780000::numeric, 0::numeric, 780000::numeric, 780000::numeric, '1 Notrizym (1kg)', 'Không áp dụng', 12),
      ('Combo 3 hũ Notrigold', 3::numeric, 'hũ', 1170000::numeric, 1170000::numeric, 5::numeric, 1112000::numeric, 1112000::numeric, '2 Notrizym (1kg)', '01 Voucher (100K)', 13),
      ('Combo 5 hũ Notrigold', 5::numeric, 'hũ', 1950000::numeric, 1950000::numeric, 10::numeric, 1755000::numeric, 1755000::numeric, '3 Notrizym (1kg)', '02 Voucher (100K)', 14),
      ('1 Thùng (12 hũ) Notrigold', 12::numeric, 'hũ', 4680000::numeric, 4680000::numeric, 15::numeric, 3978000::numeric, 3978000::numeric, '8 Notrizym (1kg)', '01 Voucher (300K)', 15),
      ('3 Thùng (36 hũ) Notrigold', 36::numeric, 'hũ', 14040000::numeric, 14040000::numeric, 17::numeric, 11653000::numeric, 11653000::numeric, '24 Notrizym (1kg)', '03 Voucher (300K)', 16),
      ('5 Thùng (60 hũ) Notrigold', 60::numeric, 'hũ', 23400000::numeric, 23400000::numeric, 19::numeric, 18954000::numeric, 18954000::numeric, '40 Notrizym (1kg)', '05 Voucher (300K)', 17),
      ('10 Thùng (120 hũ) Notrigold', 120::numeric, 'hũ', 46800000::numeric, 46800000::numeric, 21::numeric, 36972000::numeric, 36972000::numeric, '80 Notrizym (1kg)', '10 Voucher (300K)', 18)
  ) AS item(
    name,
    quantity,
    unit,
    price_before_tax,
    base_price,
    discount_percent,
    price_after_discount,
    final_price_after_discount,
    gift,
    next_voucher,
    sort_order
  )
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.products existing
    WHERE existing.parent_id = v_notrigold
      AND existing.name = item.name
  );
END $$;

NOTIFY pgrst, 'reload schema';
