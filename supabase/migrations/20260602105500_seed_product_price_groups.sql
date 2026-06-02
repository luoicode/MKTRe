  CREATE TEMP TABLE IF NOT EXISTS tmp_product_price_seed (
    group_key text NOT NULL,
    group_name text NOT NULL,
    legacy_group_name text NULL,
    row_name text NOT NULL,
    quantity numeric NOT NULL,
    unit text NOT NULL,
    price_before_tax numeric NOT NULL,
    base_price numeric NOT NULL,
    discount_percent numeric NOT NULL,
    price_after_discount numeric NOT NULL,
    final_price_after_discount numeric NOT NULL,
    gift text NOT NULL,
    next_voucher text NOT NULL,
    sort_order integer NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE tmp_product_price_seed;

  INSERT INTO tmp_product_price_seed (
    group_key,
    group_name,
    legacy_group_name,
    row_name,
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
  VALUES
    ('NOTRIBIO', 'NOTRIBIO - Siêu sát trùng nano bạc', NULL, '1 chai', 1, 'chai', 428571, 450000, 0, 450000, 450000, 'Không áp dụng', 'Không áp dụng', 110),
    ('NOTRIBIO', 'NOTRIBIO - Siêu sát trùng nano bạc', NULL, 'Combo 3 chai', 3, 'chai', 1285714, 1350000, 0, 1350000, 1350000, '1 Notrizym (1kg)', 'Không áp dụng', 111),
    ('NOTRIBIO', 'NOTRIBIO - Siêu sát trùng nano bạc', NULL, 'Combo 5 chai', 5, 'chai', 2142857, 2250000, 5, 2138000, 2137500, '2 Notrizym (1kg)', '01 Voucher (100K)', 112),
    ('NOTRIBIO', 'NOTRIBIO - Siêu sát trùng nano bạc', NULL, 'Combo 10 chai', 10, 'chai', 4285714, 4500000, 10, 4050000, 4050000, '4 Notrizym (1kg)', '02 Voucher (100K)', 113),
    ('NOTRIBIO', 'NOTRIBIO - Siêu sát trùng nano bạc', NULL, '1 Thùng (20 chai)', 20, 'chai', 8571429, 9000000, 15, 7650000, 7650000, '8 Notrizym (1kg)', '01 Voucher (300K)', 114),
    ('NOTRIBIO', 'NOTRIBIO - Siêu sát trùng nano bạc', NULL, '3 Thùng (60 chai)', 60, 'chai', 25714286, 27000000, 17, 22410000, 22410000, '24 Notrizym (1kg)', '03 Voucher (300K)', 115),
    ('NOTRIBIO', 'NOTRIBIO - Siêu sát trùng nano bạc', NULL, '5 Thùng (100 chai)', 100, 'chai', 42857143, 45000000, 19, 36450000, 36450000, '40 Notrizym (1kg)', '05 Voucher (300K)', 116),
    ('NOTRIBIO', 'NOTRIBIO - Siêu sát trùng nano bạc', NULL, '10 Thùng (200 chai)', 200, 'chai', 85714286, 90000000, 24, 68400000, 68400000, '80 Notrizym (1kg)', '10 Voucher (300K)', 117),

    ('NOTRI_MAMA', 'NOTRI MAMA - An thai dưỡng nái', NULL, '1 gói', 1, 'gói', 150000, 150000, 0, 150000, 150000, 'Không áp dụng', 'Không áp dụng', 210),
    ('NOTRI_MAMA', 'NOTRI MAMA - An thai dưỡng nái', NULL, 'Combo 3 gói', 3, 'gói', 450000, 450000, 0, 450000, 450000, 'Không áp dụng', 'Không áp dụng', 211),
    ('NOTRI_MAMA', 'NOTRI MAMA - An thai dưỡng nái', NULL, 'Combo 5 gói', 5, 'gói', 750000, 750000, 5, 713000, 713000, 'Không áp dụng', 'Không áp dụng', 212),
    ('NOTRI_MAMA', 'NOTRI MAMA - An thai dưỡng nái', NULL, 'Combo 10 gói', 10, 'gói', 1500000, 1500000, 10, 1350000, 1350000, 'Không áp dụng', 'Không áp dụng', 213),
    ('NOTRI_MAMA', 'NOTRI MAMA - An thai dưỡng nái', NULL, '1 Thùng (30 gói)', 30, 'gói', 4500000, 4500000, 15, 3825000, 3825000, 'Không áp dụng', '01 Voucher (100K)', 214),
    ('NOTRI_MAMA', 'NOTRI MAMA - An thai dưỡng nái', NULL, '3 Thùng (90 gói)', 90, 'gói', 13500000, 13500000, 17, 11205000, 11205000, 'Không áp dụng', '01 Voucher (300K)', 215),
    ('NOTRI_MAMA', 'NOTRI MAMA - An thai dưỡng nái', NULL, '5 Thùng (150 gói)', 150, 'gói', 22500000, 22500000, 19, 18225000, 18225000, 'Không áp dụng', '01 Voucher (300K), 02 Voucher (100K)', 216),
    ('NOTRI_MAMA', 'NOTRI MAMA - An thai dưỡng nái', NULL, '10 Thùng (300 gói)', 300, 'gói', 45000000, 45000000, 24, 34200000, 34200000, 'Không áp dụng', '03 Voucher (300K), 01 Voucher (100K)', 217),

    ('NOTRIBETA', 'NOTRIBETA', NULL, '1 hũ', 1, 'hũ', 490000, 490000, 0, 490000, 490000, 'Không áp dụng', 'Không áp dụng', 310),
    ('NOTRIBETA', 'NOTRIBETA', NULL, 'Combo 2 hũ', 2, 'hũ', 980000, 980000, 0, 980000, 980000, '1 Notrizym (1kg)', 'Không áp dụng', 311),
    ('NOTRIBETA', 'NOTRIBETA', NULL, 'Combo 3 hũ', 3, 'hũ', 1470000, 1470000, 5, 1397000, 1397000, '2 Notrizym (1kg)', '01 Voucher (100K)', 312),
    ('NOTRIBETA', 'NOTRIBETA', NULL, 'Combo 5 hũ', 5, 'hũ', 2450000, 2450000, 10, 2205000, 2205000, '3 Notrizym (1kg)', '02 Voucher (100K)', 313),
    ('NOTRIBETA', 'NOTRIBETA', NULL, '1 Thùng (12 hũ)', 12, 'hũ', 5880000, 5880000, 15, 4998000, 4998000, '8 Notrizym (1kg)', '01 Voucher (300K)', 314),
    ('NOTRIBETA', 'NOTRIBETA', NULL, '3 Thùng (36 hũ)', 36, 'hũ', 17640000, 17640000, 17, 14641000, 14641000, '24 Notrizym (1kg)', '03 Voucher (300K)', 315),
    ('NOTRIBETA', 'NOTRIBETA', NULL, '5 Thùng (60 hũ)', 60, 'hũ', 29400000, 29400000, 19, 23814000, 23814000, '40 Notrizym (1kg)', '05 Voucher (300K)', 316),
    ('NOTRIBETA', 'NOTRIBETA', NULL, '10 Thùng (120 hũ)', 120, 'hũ', 58800000, 58800000, 24, 44688000, 44688000, '80 Notrizym (1kg)', '10 Voucher (300K)', 317),

    ('NOTRIGROWTH', 'NOTRIGROWTH', 'Notrigrowth', '1 hũ', 1, 'hũ', 249000, 249000, 0, 249000, 249000, 'Không áp dụng', 'Không áp dụng', 410),
    ('NOTRIGROWTH', 'NOTRIGROWTH', 'Notrigrowth', 'Combo 2 hũ', 2, 'hũ', 498000, 498000, 0, 498000, 498000, 'Không áp dụng', 'Không áp dụng', 411),
    ('NOTRIGROWTH', 'NOTRIGROWTH', 'Notrigrowth', 'Combo 3 hũ', 3, 'hũ', 747000, 747000, 5, 710000, 710000, 'Không áp dụng', 'Không áp dụng', 412),
    ('NOTRIGROWTH', 'NOTRIGROWTH', 'Notrigrowth', 'Combo 5 hũ', 5, 'hũ', 1245000, 1245000, 10, 1121000, 1121000, 'Không áp dụng', 'Không áp dụng', 413),
    ('NOTRIGROWTH', 'NOTRIGROWTH', 'Notrigrowth', '1 Thùng (12 hũ)', 12, 'hũ', 2988000, 2988000, 15, 2540000, 2540000, 'Không áp dụng', '01 Voucher (100K)', 414),
    ('NOTRIGROWTH', 'NOTRIGROWTH', 'Notrigrowth', '3 Thùng (36 hũ)', 36, 'hũ', 8964000, 8964000, 17, 7440000, 7440000, 'Không áp dụng', '03 Voucher (100K)', 415),
    ('NOTRIGROWTH', 'NOTRIGROWTH', 'Notrigrowth', '5 Thùng (60 hũ)', 60, 'hũ', 14940000, 14940000, 19, 12101000, 12101000, 'Không áp dụng', '05 Voucher (100K)', 416),
    ('NOTRIGROWTH', 'NOTRIGROWTH', 'Notrigrowth', '10 Thùng (120 hũ)', 120, 'hũ', 29880000, 29880000, 21, 23605000, 23605000, 'Không áp dụng', '10 Voucher (100K)', 417),

    ('NOTRI_ALLICIN', 'NOTRI ALLICIN - Siêu men cao tỏi', 'Notri Allicin', '1 gói', 1, 'gói', 149000, 149000, 0, 149000, 149000, 'Không áp dụng', 'Không áp dụng', 510),
    ('NOTRI_ALLICIN', 'NOTRI ALLICIN - Siêu men cao tỏi', 'Notri Allicin', 'Combo 3 gói', 3, 'gói', 450000, 450000, 0, 450000, 450000, 'Không áp dụng', 'Không áp dụng', 511),
    ('NOTRI_ALLICIN', 'NOTRI ALLICIN - Siêu men cao tỏi', 'Notri Allicin', 'Combo 5 gói', 5, 'gói', 750000, 750000, 5, 713000, 713000, 'Không áp dụng', 'Không áp dụng', 512),
    ('NOTRI_ALLICIN', 'NOTRI ALLICIN - Siêu men cao tỏi', 'Notri Allicin', 'Combo 10 gói', 10, 'gói', 1500000, 1500000, 10, 1350000, 1350000, 'Không áp dụng', 'Không áp dụng', 513),
    ('NOTRI_ALLICIN', 'NOTRI ALLICIN - Siêu men cao tỏi', 'Notri Allicin', '1 Thùng (30 gói)', 30, 'gói', 4500000, 4500000, 15, 3825000, 3825000, 'Không áp dụng', '01 Voucher (100K)', 514),
    ('NOTRI_ALLICIN', 'NOTRI ALLICIN - Siêu men cao tỏi', 'Notri Allicin', '3 Thùng (90 gói)', 90, 'gói', 13500000, 13500000, 17, 11205000, 11205000, 'Không áp dụng', '01 Voucher (300K)', 515),
    ('NOTRI_ALLICIN', 'NOTRI ALLICIN - Siêu men cao tỏi', 'Notri Allicin', '5 Thùng (150 gói)', 150, 'gói', 22500000, 22500000, 19, 18225000, 18225000, 'Không áp dụng', '01 Voucher (300K), 02 Voucher (100K)', 516),
    ('NOTRI_ALLICIN', 'NOTRI ALLICIN - Siêu men cao tỏi', 'Notri Allicin', '10 Thùng (300 gói)', 300, 'gói', 45000000, 45000000, 24, 34200000, 34200000, 'Không áp dụng', '03 Voucher (300K), 01 Voucher (100K)', 517),

    ('NOTRICLEAN', 'NOTRICLEAN - Men rác chuồng', NULL, '1 gói', 1, 'gói', 99000, 99000, 0, 99000, 99000, 'Không áp dụng', 'Không áp dụng', 610),
    ('NOTRICLEAN', 'NOTRICLEAN - Men rác chuồng', NULL, 'Combo 3 gói', 3, 'gói', 297000, 297000, 0, 297000, 297000, 'Không áp dụng', 'Không áp dụng', 611),
    ('NOTRICLEAN', 'NOTRICLEAN - Men rác chuồng', NULL, 'Combo 5 gói', 5, 'gói', 495000, 495000, 5, 470000, 470000, 'Không áp dụng', 'Không áp dụng', 612),
    ('NOTRICLEAN', 'NOTRICLEAN - Men rác chuồng', NULL, 'Combo 10 gói', 10, 'gói', 990000, 990000, 10, 891000, 891000, 'Không áp dụng', 'Không áp dụng', 613),
    ('NOTRICLEAN', 'NOTRICLEAN - Men rác chuồng', NULL, '1 Thùng (30 gói)', 30, 'gói', 2970000, 2970000, 15, 2525000, 2525000, 'Không áp dụng', '01 Voucher (100K)', 614),
    ('NOTRICLEAN', 'NOTRICLEAN - Men rác chuồng', NULL, '3 Thùng (90 gói)', 90, 'gói', 8910000, 8910000, 17, 7395000, 7395000, 'Không áp dụng', '01 Voucher (300K)', 615),
    ('NOTRICLEAN', 'NOTRICLEAN - Men rác chuồng', NULL, '5 Thùng (150 gói)', 150, 'gói', 14850000, 14850000, 19, 12029000, 12029000, 'Không áp dụng', '01 Voucher (300K), 02 Voucher (100K)', 616),
    ('NOTRICLEAN', 'NOTRICLEAN - Men rác chuồng', NULL, '10 Thùng (300 gói)', 300, 'gói', 29700000, 29700000, 24, 22572000, 22572000, 'Không áp dụng', '03 Voucher (300K), 01 Voucher (100K)', 617);

  DO $$
  DECLARE
    v_group record;
    v_item record;
    v_parent_id uuid;
  BEGIN
    FOR v_group IN
    SELECT
      group_key,
      group_name,
      legacy_group_name,
      min(sort_order) - 1 AS parent_sort_order
    FROM tmp_product_price_seed
    GROUP BY
      group_key,
      group_name,
      legacy_group_name
    ORDER BY min(sort_order)
  LOOP
      SELECT id INTO v_parent_id
      FROM public.products
      WHERE parent_id IS NULL
        AND (
          lower(name) = lower(v_group.group_name)
          OR lower(product_group) = lower(v_group.group_name)
          OR (
            v_group.legacy_group_name IS NOT NULL
            AND (
              lower(name) = lower(v_group.legacy_group_name)
              OR lower(product_group) = lower(v_group.legacy_group_name)
            )
          )
        )
      ORDER BY created_at
      LIMIT 1;

      IF v_parent_id IS NULL THEN
        INSERT INTO public.products (
          name,
          product_group,
          quantity,
          unit,
          gift,
          next_voucher,
          sort_order,
          is_active
        )
        VALUES (
          v_group.group_name,
          v_group.group_name,
          0,
          '',
          'Không áp dụng',
          'Không áp dụng',
          v_group.parent_sort_order,
          true
        )
        RETURNING id INTO v_parent_id;
      ELSE
        UPDATE public.products
        SET
          name = v_group.group_name,
          product_group = v_group.group_name,
          sort_order = v_group.parent_sort_order,
          is_active = true
        WHERE id = v_parent_id;
      END IF;

      FOR v_item IN
        SELECT *
        FROM tmp_product_price_seed
        WHERE group_key = v_group.group_key
        ORDER BY sort_order
      LOOP
        IF EXISTS (
          SELECT 1
          FROM public.products
          WHERE parent_id = v_parent_id
            AND lower(name) = lower(v_item.row_name)
        ) THEN
          UPDATE public.products
          SET
            product_group = v_group.group_name,
            quantity = v_item.quantity,
            unit = v_item.unit,
            price_before_tax = v_item.price_before_tax,
            base_price = v_item.base_price,
            discount_percent = v_item.discount_percent,
            price_after_discount = v_item.price_after_discount,
            final_price_after_discount = v_item.final_price_after_discount,
            gift = v_item.gift,
            next_voucher = v_item.next_voucher,
            sort_order = v_item.sort_order,
            is_active = true
          WHERE parent_id = v_parent_id
            AND lower(name) = lower(v_item.row_name);
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
            v_item.row_name,
            v_group.group_name,
            v_item.quantity,
            v_item.unit,
            v_item.price_before_tax,
            v_item.base_price,
            v_item.discount_percent,
            v_item.price_after_discount,
            v_item.final_price_after_discount,
            v_item.gift,
            v_item.next_voucher,
            v_item.sort_order,
            true
          );
        END IF;
      END LOOP;
    END LOOP;
  END $$;

  NOTIFY pgrst, 'reload schema';
