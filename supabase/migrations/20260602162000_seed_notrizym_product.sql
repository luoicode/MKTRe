DO $$
DECLARE
  v_parent_id uuid;
  v_item record;
BEGIN
  SELECT id INTO v_parent_id
  FROM public.products
  WHERE parent_id IS NULL
    AND (
      lower(name) = 'notrizym'
      OR lower(product_group) = 'notrizym'
    )
  ORDER BY created_at
  LIMIT 1;

  IF v_parent_id IS NULL THEN
    INSERT INTO public.products (
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
      sort_order,
      is_active
    )
    VALUES (
      'NOTRIZYM',
      'notrizym',
      0,
      '',
      0,
      0,
      0,
      0,
      0,
      'Không áp dụng',
      'Không áp dụng',
      80,
      true
    )
    RETURNING id INTO v_parent_id;
  ELSE
    UPDATE public.products
    SET
      name = 'NOTRIZYM',
      product_group = 'notrizym',
      price_before_tax = 0,
      base_price = 0,
      discount_percent = 0,
      price_after_discount = 0,
      final_price_after_discount = 0,
      gift = 'Không áp dụng',
      next_voucher = 'Không áp dụng',
      sort_order = 80,
      is_active = true
    WHERE id = v_parent_id;
  END IF;

  FOR v_item IN
    SELECT *
    FROM (
      VALUES
        ('1 gói (1KG)', 1::numeric, 'gói', 81),
        ('Combo 3 gói (3KG)', 3::numeric, 'gói', 82),
        ('Combo 5 gói (5KG)', 5::numeric, 'gói', 83),
        ('Combo 10 gói (10KG)', 10::numeric, 'gói', 84),
        ('1 Thùng (30 gói - 30KG)', 30::numeric, 'gói', 85),
        ('3 Thùng (90 gói - 90KG)', 90::numeric, 'gói', 86),
        ('5 Thùng (150 gói - 150KG)', 150::numeric, 'gói', 87),
        ('10 Thùng (300 gói - 300KG)', 300::numeric, 'gói', 88)
    ) AS item(name, quantity, unit, sort_order)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.products
      WHERE parent_id = v_parent_id
        AND lower(name) = lower(v_item.name)
    ) THEN
      UPDATE public.products
      SET
        product_group = 'notrizym',
        quantity = v_item.quantity,
        unit = v_item.unit,
        price_before_tax = 0,
        base_price = 0,
        discount_percent = 0,
        price_after_discount = 0,
        final_price_after_discount = 0,
        gift = 'Không áp dụng',
        next_voucher = 'Không áp dụng',
        sort_order = v_item.sort_order,
        is_active = true
      WHERE parent_id = v_parent_id
        AND lower(name) = lower(v_item.name);
    ELSE
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
        sort_order,
        is_active
      )
      VALUES (
        v_parent_id,
        v_item.name,
        'notrizym',
        v_item.quantity,
        v_item.unit,
        0,
        0,
        0,
        0,
        0,
        'Không áp dụng',
        'Không áp dụng',
        v_item.sort_order,
        true
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
