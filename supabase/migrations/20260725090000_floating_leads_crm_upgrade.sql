-- Upgrade the existing floating lead pool without removing legacy columns or data.

BEGIN;

ALTER TABLE public.floating_leads
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS assigned_sale_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_sale_name text,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS lead_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Chưa gọi';

ALTER TABLE public.floating_leads
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS normalized_phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS loai_cay_trong text,
  ADD COLUMN IF NOT EXISTS dien_tich text,
  ADD COLUMN IF NOT EXISTS tinh_trang_cay_trong text,
  ADD COLUMN IF NOT EXISTS giai_doan_cay_trong text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS import_id uuid,
  ADD COLUMN IF NOT EXISTS import_file_name text,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS call_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_called_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_call_result text,
  ADD COLUMN IF NOT EXISTS follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.floating_leads
  DROP CONSTRAINT IF EXISTS floating_leads_status_check;

ALTER TABLE public.floating_leads
  ADD CONSTRAINT floating_leads_status_check CHECK (
    status IN (
      'Chưa gọi', 'Mới', 'Không nghe máy', 'Hẹn gọi lại', 'Đang cân nhắc',
      'Đang xử lý', 'Đã gọi', 'Đã bị chốt', 'Đã chốt', 'Không mua', 'Khách trêu'
    )
  ) NOT VALID;

UPDATE public.floating_leads SET status = 'Đang xử lý' WHERE status = 'Đang xử lí';

ALTER TABLE public.floating_leads VALIDATE CONSTRAINT floating_leads_status_check;

CREATE OR REPLACE FUNCTION public.normalize_floating_lead_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g') LIKE '+84%'
      THEN '0' || substring(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g') FROM 4)
    WHEN regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') LIKE '84%'
         AND length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) BETWEEN 10 AND 11
      THEN '0' || substring(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') FROM 3)
    ELSE regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_floating_lead_normalized_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.normalized_phone := public.normalize_floating_lead_phone(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_floating_leads_normalized_phone ON public.floating_leads;
CREATE TRIGGER trg_floating_leads_normalized_phone
BEFORE INSERT OR UPDATE OF phone ON public.floating_leads
FOR EACH ROW EXECUTE FUNCTION public.set_floating_lead_normalized_phone();

UPDATE public.floating_leads
SET normalized_phone = public.normalize_floating_lead_phone(phone)
WHERE normalized_phone IS NULL OR normalized_phone = '';

CREATE INDEX IF NOT EXISTS idx_floating_leads_normalized_phone
  ON public.floating_leads(normalized_phone) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_floating_leads_import_id
  ON public.floating_leads(import_id) WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_floating_leads_source_type
  ON public.floating_leads(source_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_floating_leads_follow_up_at
  ON public.floating_leads(follow_up_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.floating_lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.floating_leads(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  old_value text,
  new_value text,
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_floating_lead_activities_lead_created
  ON public.floating_lead_activities(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.floating_lead_reset_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text,
  from_date date,
  to_date date,
  deleted_count integer NOT NULL DEFAULT 0 CHECK (deleted_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_floating_lead_reset_logs_created_at
  ON public.floating_lead_reset_logs(created_at DESC);

ALTER TABLE public.floating_lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floating_lead_reset_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS floating_lead_reset_logs_admin_manager_select ON public.floating_lead_reset_logs;
CREATE POLICY floating_lead_reset_logs_admin_manager_select
  ON public.floating_lead_reset_logs FOR SELECT TO authenticated
  USING (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role));

DROP POLICY IF EXISTS floating_lead_activities_admin_manager_all
  ON public.floating_lead_activities;
CREATE POLICY floating_lead_activities_admin_manager_all
  ON public.floating_lead_activities
  FOR ALL TO authenticated
  USING (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role))
  WITH CHECK (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role));

DROP POLICY IF EXISTS floating_lead_activities_sale_select
  ON public.floating_lead_activities;
CREATE POLICY floating_lead_activities_sale_select
  ON public.floating_lead_activities
  FOR SELECT TO authenticated
  USING (
    (public.has_role('sale'::public.app_role) OR public.has_role('leader_sale'::public.app_role))
    AND EXISTS (
      SELECT 1 FROM public.floating_leads fl
      WHERE fl.id = floating_lead_activities.lead_id
        AND fl.deleted_at IS NULL
    )
  );

CREATE OR REPLACE FUNCTION public.import_floating_leads_batch(
  p_records jsonb,
  p_duplicate_strategy text,
  p_import_id uuid,
  p_file_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid := public.get_current_profile_id();
  v_profile_name text;
  v_total integer := coalesce(jsonb_array_length(p_records), 0);
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role)) THEN
    RAISE EXCEPTION 'Chỉ Admin/Manager được nhập file vào kho thả nổi';
  END IF;
  IF v_total = 0 OR v_total > 100 THEN
    RAISE EXCEPTION 'Mỗi batch phải có từ 1 đến 100 dòng';
  END IF;
  IF p_duplicate_strategy NOT IN ('skip', 'update', 'insert_anyway') THEN
    RAISE EXCEPTION 'Chiến lược xử lý trùng không hợp lệ';
  END IF;

  SELECT coalesce(full_name, username, 'Admin') INTO v_profile_name
  FROM public.profiles WHERE id = v_profile_id;

  CREATE TEMP TABLE IF NOT EXISTS tmp_floating_import (
    row_index integer,
    customer_name text,
    phone text,
    normalized_phone text,
    address text,
    loai_cay_trong text,
    dien_tich text,
    tinh_trang_cay_trong text,
    giai_doan_cay_trong text,
    source_type text,
    is_valid boolean
  ) ON COMMIT DROP;
  TRUNCATE tmp_floating_import;

  INSERT INTO tmp_floating_import
  SELECT
    ordinality::integer,
    nullif(btrim(value->>'customer_name'), ''),
    btrim(coalesce(value->>'phone', '')),
    public.normalize_floating_lead_phone(value->>'phone'),
    nullif(btrim(value->>'address'), ''),
    nullif(btrim(value->>'loai_cay_trong'), ''),
    nullif(btrim(value->>'dien_tich'), ''),
    nullif(btrim(value->>'tinh_trang_cay_trong'), ''),
    nullif(btrim(value->>'giai_doan_cay_trong'), ''),
    coalesce(nullif(btrim(value->>'source_type'), ''), 'excel_csv'),
    length(public.normalize_floating_lead_phone(value->>'phone')) BETWEEN 9 AND 11
  FROM jsonb_array_elements(p_records) WITH ORDINALITY;

  SELECT count(*) INTO v_failed FROM tmp_floating_import WHERE NOT is_valid;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'row_index', row_index,
    'phone', phone,
    'reason', 'Số điện thoại không hợp lệ'
  ) ORDER BY row_index), '[]'::jsonb)
  INTO v_errors
  FROM tmp_floating_import WHERE NOT is_valid;

  IF p_duplicate_strategy = 'update' THEN
    WITH candidates AS (
      SELECT DISTINCT ON (normalized_phone) *
      FROM tmp_floating_import
      WHERE is_valid
      ORDER BY normalized_phone, row_index DESC
    ), updated AS (
      UPDATE public.floating_leads fl
      SET customer_name = coalesce(c.customer_name, fl.customer_name),
          phone = c.phone,
          address = coalesce(c.address, fl.address),
          loai_cay_trong = coalesce(c.loai_cay_trong, fl.loai_cay_trong),
          dien_tich = coalesce(c.dien_tich, fl.dien_tich),
          tinh_trang_cay_trong = coalesce(c.tinh_trang_cay_trong, fl.tinh_trang_cay_trong),
          giai_doan_cay_trong = coalesce(c.giai_doan_cay_trong, fl.giai_doan_cay_trong),
          source_type = c.source_type,
          import_id = p_import_id,
          import_file_name = p_file_name,
          imported_at = now(),
          updated_at = now()
      FROM candidates c
      WHERE fl.normalized_phone = c.normalized_phone AND fl.deleted_at IS NULL
      RETURNING fl.id
    ), logged AS (
      INSERT INTO public.floating_lead_activities(
        lead_id, activity_type, note, created_by, created_by_name
      )
      SELECT id, 'lead_import_updated', 'Cập nhật từ file ' || coalesce(p_file_name, ''),
        v_profile_id, v_profile_name
      FROM updated
      RETURNING lead_id
    ) SELECT count(*) INTO v_updated FROM logged;
  END IF;

  WITH valid_rows AS (
    SELECT DISTINCT ON (normalized_phone, CASE WHEN p_duplicate_strategy = 'insert_anyway' THEN row_index ELSE 0 END) *
    FROM tmp_floating_import
    WHERE is_valid
    ORDER BY normalized_phone, CASE WHEN p_duplicate_strategy = 'insert_anyway' THEN row_index ELSE 0 END, row_index
  ), to_insert AS (
    SELECT v.* FROM valid_rows v
    WHERE p_duplicate_strategy = 'insert_anyway'
       OR NOT EXISTS (
         SELECT 1 FROM public.floating_leads fl
         WHERE fl.normalized_phone = v.normalized_phone AND fl.deleted_at IS NULL
       )
  ), inserted AS (
    INSERT INTO public.floating_leads (
      customer_name, phone, normalized_phone, address, loai_cay_trong, dien_tich,
      tinh_trang_cay_trong, giai_doan_cay_trong, source_type,
      import_id, import_file_name, imported_at, created_by, created_by_name,
      lead_date, status, lifecycle_status
    )
    SELECT customer_name, phone, normalized_phone, address, loai_cay_trong, dien_tich,
      tinh_trang_cay_trong, giai_doan_cay_trong, source_type,
      p_import_id, p_file_name, now(), v_profile_id, v_profile_name,
      (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'Chưa gọi', 'new'
    FROM to_insert
    RETURNING id
  ), logged AS (
    INSERT INTO public.floating_lead_activities(
      lead_id, activity_type, new_value, note, created_by, created_by_name
    )
    SELECT id, 'lead_imported', 'Mới', 'Nhập từ file ' || coalesce(p_file_name, ''),
      v_profile_id, v_profile_name
    FROM inserted
    RETURNING id
  ) SELECT count(*) INTO v_inserted FROM logged;

  v_skipped := greatest(v_total - v_failed - v_inserted - v_updated, 0);
  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped,
    'failed', v_failed,
    'errors', v_errors
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fetch_floating_leads_page(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_marketing_id uuid DEFAULT NULL,
  p_sale_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_crop text DEFAULT NULL,
  p_source_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid := public.get_current_profile_id();
  v_is_admin boolean := public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role);
  v_is_sale boolean := public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role);
  v_result jsonb;
BEGIN
  IF NOT (v_is_admin OR v_is_sale) THEN
    RAISE EXCEPTION 'Bạn không có quyền xem kho thả nổi';
  END IF;
  p_page := greatest(coalesce(p_page, 1), 1);
  p_page_size := least(greatest(coalesce(p_page_size, 50), 1), 100);

  WITH filtered AS (
    SELECT
      fl.id, fl.phone, fl.source, fl.created_by, fl.created_by_name,
      fl.assigned_sale_id, fl.assigned_sale_name, fl.lead_date, fl.status, fl.note,
      fl.created_at, fl.updated_at, fl.assigned_at, fl.lifecycle_status,
      fl.customer_name, fl.normalized_phone, fl.address, fl.loai_cay_trong,
      fl.dien_tich, fl.tinh_trang_cay_trong, fl.giai_doan_cay_trong,
      fl.source_type, fl.imported_at, fl.call_count, fl.last_called_at,
      fl.latest_call_result, fl.follow_up_at
    FROM public.floating_leads fl
    WHERE fl.deleted_at IS NULL
      AND (v_is_admin OR v_is_sale)
      AND (p_search IS NULL OR p_search = '' OR fl.customer_name ILIKE '%' || p_search || '%'
           OR fl.phone ILIKE '%' || p_search || '%' OR fl.normalized_phone ILIKE '%' || p_search || '%')
      AND (p_status IS NULL OR p_status = '' OR p_status = 'all' OR fl.status = p_status OR fl.lifecycle_status = p_status)
      AND (p_marketing_id IS NULL OR fl.created_by = p_marketing_id)
      AND (p_sale_id IS NULL OR fl.assigned_sale_id = p_sale_id)
      AND (p_from IS NULL OR fl.lead_date >= p_from)
      AND (p_to IS NULL OR fl.lead_date <= p_to)
      AND (p_crop IS NULL OR p_crop = '' OR fl.loai_cay_trong = p_crop)
      AND (p_source_type IS NULL OR p_source_type = '' OR fl.source_type = p_source_type)
  ), paged AS (
    SELECT *, count(*) OVER () AS total_count
    FROM filtered
    ORDER BY lead_date DESC, created_at DESC
    LIMIT p_page_size OFFSET (p_page - 1) * p_page_size
  )
  SELECT jsonb_build_object(
    'rows', coalesce(jsonb_agg(to_jsonb(paged) - 'total_count'), '[]'::jsonb),
    'total', coalesce(max(total_count), (SELECT count(*) FROM filtered), 0)
  ) INTO v_result FROM paged;
  RETURN coalesce(v_result, jsonb_build_object('rows', '[]'::jsonb, 'total', 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_update_floating_leads(
  p_lead_ids uuid[], p_action text, p_value text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_actor uuid := public.get_current_profile_id();
  v_sale_name text;
  v_sale_id uuid;
  v_sale_status text;
  v_status text;
BEGIN
  IF NOT (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role)) THEN
    RAISE EXCEPTION 'Chỉ Admin/Manager được thao tác hàng loạt';
  END IF;
  IF coalesce(array_length(p_lead_ids, 1), 0) = 0 THEN RETURN 0; END IF;
  IF array_length(p_lead_ids, 1) > 1000 THEN
    RAISE EXCEPTION 'Mỗi lần chỉ được thao tác tối đa 1000 lead';
  END IF;

  IF p_action = 'delete' THEN
    UPDATE public.floating_leads SET deleted_at = now(), deleted_by = v_actor
    WHERE id = ANY(p_lead_ids) AND deleted_at IS NULL;
  ELSIF p_action = 'status' THEN
    v_status := CASE WHEN p_value = 'Đang xử lí' THEN 'Đang xử lý' ELSE p_value END;
    IF v_status IS NULL OR v_status NOT IN (
      'Chưa gọi', 'Mới', 'Không nghe máy', 'Hẹn gọi lại', 'Đang cân nhắc',
      'Đang xử lý', 'Đã gọi', 'Đã bị chốt', 'Đã chốt', 'Không mua', 'Khách trêu'
    ) THEN RAISE EXCEPTION 'Trạng thái lead không hợp lệ'; END IF;
    UPDATE public.floating_leads SET status = v_status
    WHERE id = ANY(p_lead_ids) AND deleted_at IS NULL;
  ELSIF p_action = 'assign_sale' THEN
    IF p_value IS NULL OR p_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Nhân viên Sale không hợp lệ: ID phải là UUID';
    END IF;
    v_sale_id := p_value::uuid;
    SELECT coalesce(full_name, username), status::text INTO v_sale_name, v_sale_status
    FROM public.profiles WHERE id = v_sale_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy nhân viên Sale'; END IF;
    IF v_sale_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Nhân viên Sale đang không hoạt động'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_sale_id
        AND ur.role IN ('sale'::public.app_role, 'leader_sale'::public.app_role)
    ) THEN RAISE EXCEPTION 'Tài khoản được chọn không có vai trò Sale hoặc Leader Sale'; END IF;
    UPDATE public.floating_leads
    SET assigned_sale_id = v_sale_id, assigned_sale_name = v_sale_name,
        assigned_at = now(), lifecycle_status = 'claimed'
    WHERE id = ANY(p_lead_ids) AND deleted_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Hành động không hợp lệ';
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.floating_lead_activities(
    lead_id, activity_type, new_value, note, created_by, created_by_name
  )
  SELECT fl.id,
    CASE p_action WHEN 'delete' THEN 'lead_deleted' WHEN 'assign_sale' THEN 'sale_assigned' ELSE 'status_changed' END,
    CASE p_action WHEN 'assign_sale' THEN v_sale_name WHEN 'status' THEN v_status ELSE p_value END,
    'Admin thao tác hàng loạt', v_actor,
    coalesce((SELECT coalesce(full_name, username) FROM public.profiles WHERE id = v_actor), 'Admin')
  FROM public.floating_leads fl
  WHERE fl.id = ANY(p_lead_ids);
  RETURN v_count;
END;
$$;

DROP FUNCTION IF EXISTS public.update_floating_lead_crm(uuid, text, text, text, timestamptz);

CREATE OR REPLACE FUNCTION public.update_floating_lead_crm(
  p_lead_id uuid,
  p_status text DEFAULT NULL,
  p_call_result text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_follow_up_at timestamptz DEFAULT NULL,
  p_clear_follow_up boolean DEFAULT false
)
RETURNS public.floating_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid := public.get_current_profile_id();
  v_profile_name text;
  v_old public.floating_leads;
  v_new public.floating_leads;
  v_status text := CASE WHEN p_status = 'Đang xử lí' THEN 'Đang xử lý' ELSE p_status END;
BEGIN
  IF NOT (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  ) THEN RAISE EXCEPTION 'Chỉ Sale/Leader Sale được cập nhật'; END IF;
  SELECT * INTO v_old FROM public.floating_leads WHERE id = p_lead_id AND deleted_at IS NULL FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy lead trong kho thả nổi'; END IF;
  SELECT coalesce(full_name, username, 'Sale') INTO v_profile_name FROM public.profiles WHERE id = v_profile_id;

  -- Reuse the existing trigger bypass without changing the legacy CRM trigger.
  PERFORM set_config('app.releasing_floating_leads', 'true', true);
  UPDATE public.floating_leads SET
    status = coalesce(nullif(v_status, ''), status),
    call_count = call_count + CASE WHEN nullif(btrim(coalesce(p_call_result, '')), '') IS NULL THEN 0 ELSE 1 END,
    last_called_at = CASE WHEN nullif(btrim(coalesce(p_call_result, '')), '') IS NULL THEN last_called_at ELSE now() END,
    latest_call_result = coalesce(nullif(btrim(p_call_result), ''), latest_call_result),
    note = coalesce(nullif(btrim(p_note), ''), note),
    follow_up_at = CASE
      WHEN p_clear_follow_up THEN NULL
      WHEN p_follow_up_at IS NOT NULL THEN p_follow_up_at
      ELSE follow_up_at
    END,
    updated_at = now()
  WHERE id = p_lead_id RETURNING * INTO v_new;

  IF v_status IS NOT NULL AND v_status IS DISTINCT FROM v_old.status THEN
    INSERT INTO public.floating_lead_activities(lead_id, activity_type, old_value, new_value, created_by, created_by_name)
    VALUES (p_lead_id, 'status_changed', v_old.status, v_status, v_profile_id, v_profile_name);
  END IF;
  IF nullif(btrim(coalesce(p_call_result, '')), '') IS NOT NULL THEN
    INSERT INTO public.floating_lead_activities(lead_id, activity_type, new_value, note, created_by, created_by_name)
    VALUES (p_lead_id, 'call_logged', p_call_result, p_note, v_profile_id, v_profile_name);
  ELSIF nullif(btrim(coalesce(p_note, '')), '') IS NOT NULL THEN
    INSERT INTO public.floating_lead_activities(lead_id, activity_type, note, created_by, created_by_name)
    VALUES (p_lead_id, 'note_added', p_note, v_profile_id, v_profile_name);
  END IF;
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_floating_leads(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_actor uuid := public.get_current_profile_id();
  v_actor_name text;
BEGIN
  IF NOT (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role)) THEN
    RAISE EXCEPTION 'Chỉ Admin/Manager được reset kho';
  END IF;
  UPDATE public.floating_leads SET deleted_at = now(), deleted_by = v_actor
  WHERE deleted_at IS NULL AND (p_from IS NULL OR lead_date >= p_from) AND (p_to IS NULL OR lead_date <= p_to);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SELECT coalesce(full_name, username, 'Admin') INTO v_actor_name
  FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.floating_lead_reset_logs(actor_id, actor_name, from_date, to_date, deleted_count)
  VALUES (v_actor, coalesce(v_actor_name, 'Admin'), p_from, p_to, v_count);
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_floating_lead_details(
  p_lead_id uuid,
  p_customer_name text,
  p_phone text,
  p_address text,
  p_crop text,
  p_area text,
  p_crop_condition text,
  p_crop_stage text,
  p_source_type text
)
RETURNS public.floating_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_old public.floating_leads; v_new public.floating_leads; v_actor uuid := public.get_current_profile_id(); v_name text;
BEGIN
  IF NOT (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role)) THEN
    RAISE EXCEPTION 'Chỉ Admin/Manager được chỉnh sửa lead';
  END IF;
  SELECT * INTO v_old FROM public.floating_leads WHERE id = p_lead_id AND deleted_at IS NULL FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy lead'; END IF;
  SELECT coalesce(full_name, username, 'Admin') INTO v_name FROM public.profiles WHERE id = v_actor;
  UPDATE public.floating_leads SET
    customer_name = nullif(btrim(p_customer_name), ''),
    phone = btrim(p_phone),
    normalized_phone = public.normalize_floating_lead_phone(p_phone),
    address = nullif(btrim(p_address), ''),
    loai_cay_trong = nullif(btrim(p_crop), ''),
    dien_tich = nullif(btrim(p_area), ''),
    tinh_trang_cay_trong = nullif(btrim(p_crop_condition), ''),
    giai_doan_cay_trong = nullif(btrim(p_crop_stage), ''),
    source_type = nullif(btrim(p_source_type), ''),
    updated_at = now()
  WHERE id = p_lead_id RETURNING * INTO v_new;
  INSERT INTO public.floating_lead_activities(lead_id, activity_type, note, created_by, created_by_name)
  VALUES (p_lead_id, 'lead_updated', 'Admin cập nhật thông tin lead', v_actor, v_name);
  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.import_floating_leads_batch(jsonb, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fetch_floating_leads_page(integer, integer, text, text, uuid, uuid, date, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_update_floating_leads(uuid[], text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_floating_lead_crm(uuid, text, text, text, timestamptz, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_floating_leads(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_floating_lead_details(uuid, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_floating_leads_batch(jsonb, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_floating_leads_page(integer, integer, text, text, uuid, uuid, date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_floating_leads(uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_floating_lead_crm(uuid, text, text, text, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_floating_leads(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_floating_lead_details(uuid, text, text, text, text, text, text, text, text) TO authenticated;
GRANT SELECT ON TABLE public.floating_lead_reset_logs TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
