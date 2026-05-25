CREATE TABLE IF NOT EXISTS public.sale_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  slot_key text NOT NULL CHECK (slot_key IN ('morning', 'afternoon', 'evening')),
  slot_time text NOT NULL,
  new_data_received integer NOT NULL DEFAULT 0,
  new_data_closed integer NOT NULL DEFAULT 0,
  floating_data_closed integer NOT NULL DEFAULT 0,
  floating_data_received integer NOT NULL DEFAULT 0,
  new_customer_revenue numeric NOT NULL DEFAULT 0,
  floating_revenue numeric NOT NULL DEFAULT 0,
  old_customers integer NOT NULL DEFAULT 0,
  note text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_reports_user_date_slot_unique UNIQUE (user_id, report_date, slot_key)
);

CREATE INDEX IF NOT EXISTS idx_sale_reports_user_date
  ON public.sale_reports(user_id, report_date);

CREATE INDEX IF NOT EXISTS idx_sale_reports_user_date_status
  ON public.sale_reports(user_id, report_date, status);

DROP TRIGGER IF EXISTS tr_sale_reports_updated ON public.sale_reports;
CREATE TRIGGER tr_sale_reports_updated
BEFORE UPDATE ON public.sale_reports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sale_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_reports_admin_manager_all ON public.sale_reports;
CREATE POLICY sale_reports_admin_manager_all ON public.sale_reports
FOR ALL TO authenticated
USING (public.has_role('admin') OR public.has_role('manager'))
WITH CHECK (public.has_role('admin') OR public.has_role('manager'));

DROP POLICY IF EXISTS sale_reports_self_select ON public.sale_reports;
CREATE POLICY sale_reports_self_select ON public.sale_reports
FOR SELECT TO authenticated
USING (
  user_id = public.get_current_profile_id()
  AND public.has_role('sale')
);

DROP POLICY IF EXISTS sale_reports_self_insert ON public.sale_reports;
CREATE POLICY sale_reports_self_insert ON public.sale_reports
FOR INSERT TO authenticated
WITH CHECK (
  user_id = public.get_current_profile_id()
  AND public.has_role('sale')
  AND public.is_active_user()
);

DROP POLICY IF EXISTS sale_reports_self_update ON public.sale_reports;
CREATE POLICY sale_reports_self_update ON public.sale_reports
FOR UPDATE TO authenticated
USING (
  user_id = public.get_current_profile_id()
  AND public.has_role('sale')
  AND status = 'draft'
)
WITH CHECK (
  user_id = public.get_current_profile_id()
  AND public.has_role('sale')
  AND public.is_active_user()
);

NOTIFY pgrst, 'reload schema';
