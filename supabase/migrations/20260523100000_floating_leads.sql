CREATE TABLE IF NOT EXISTS public.floating_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  source text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by_name text,
  assigned_sale_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_sale_name text,
  lead_date date NOT NULL DEFAULT CURRENT_DATE,
  call_1 text,
  call_2 text,
  call_3 text,
  status text NOT NULL DEFAULT 'Chưa gọi' CHECK (
    status IN (
      'Chưa gọi',
      'Không nghe máy',
      'Hẹn gọi lại',
      'Đang cân nhắc',
      'Đã bị chốt',
      'Không mua',
      'Khách trêu'
    )
  ),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_floating_leads_lead_date
  ON public.floating_leads(lead_date);

CREATE INDEX IF NOT EXISTS idx_floating_leads_created_by
  ON public.floating_leads(created_by);

CREATE INDEX IF NOT EXISTS idx_floating_leads_assigned_sale_id
  ON public.floating_leads(assigned_sale_id);

CREATE INDEX IF NOT EXISTS idx_floating_leads_status
  ON public.floating_leads(status);

DROP TRIGGER IF EXISTS tr_floating_leads_updated ON public.floating_leads;
CREATE TRIGGER tr_floating_leads_updated
BEFORE UPDATE ON public.floating_leads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.guard_floating_leads_sale_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role('sale') AND NOT (public.has_role('admin') OR public.has_role('manager')) THEN
    IF NEW.phone IS DISTINCT FROM OLD.phone
      OR NEW.source IS DISTINCT FROM OLD.source
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_by_name IS DISTINCT FROM OLD.created_by_name
      OR NEW.lead_date IS DISTINCT FROM OLD.lead_date THEN
      RAISE EXCEPTION 'Sale cannot update lead source fields';
    END IF;

    IF OLD.assigned_sale_id IS NOT NULL
      AND OLD.assigned_sale_id <> public.get_current_profile_id() THEN
      RAISE EXCEPTION 'Lead already assigned';
    END IF;

    IF OLD.assigned_sale_id IS NULL
      AND NEW.assigned_sale_id <> public.get_current_profile_id() THEN
      RAISE EXCEPTION 'Sale can only claim for self';
    END IF;

    IF OLD.assigned_sale_id IS NOT NULL
      AND NEW.assigned_sale_id IS DISTINCT FROM OLD.assigned_sale_id THEN
      RAISE EXCEPTION 'Cannot reassign claimed lead';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_guard_floating_leads_sale_update ON public.floating_leads;
CREATE TRIGGER tr_guard_floating_leads_sale_update
BEFORE UPDATE ON public.floating_leads
FOR EACH ROW EXECUTE FUNCTION public.guard_floating_leads_sale_update();

ALTER TABLE public.floating_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS floating_leads_admin_manager_all ON public.floating_leads;
CREATE POLICY floating_leads_admin_manager_all ON public.floating_leads
FOR ALL TO authenticated
USING (public.has_role('admin') OR public.has_role('manager'))
WITH CHECK (public.has_role('admin') OR public.has_role('manager'));

DROP POLICY IF EXISTS floating_leads_marketing_select_own ON public.floating_leads;
CREATE POLICY floating_leads_marketing_select_own ON public.floating_leads
FOR SELECT TO authenticated
USING (
  created_by = public.get_current_profile_id()
  AND public.has_role('employee')
);

DROP POLICY IF EXISTS floating_leads_marketing_insert_own ON public.floating_leads;
CREATE POLICY floating_leads_marketing_insert_own ON public.floating_leads
FOR INSERT TO authenticated
WITH CHECK (
  created_by = public.get_current_profile_id()
  AND assigned_sale_id IS NULL
  AND public.has_role('employee')
  AND public.is_active_user()
);

DROP POLICY IF EXISTS floating_leads_sale_select_all ON public.floating_leads;
CREATE POLICY floating_leads_sale_select_all ON public.floating_leads
FOR SELECT TO authenticated
USING (
  public.has_role('sale')
  AND public.is_active_user()
);

DROP POLICY IF EXISTS floating_leads_sale_update_scope ON public.floating_leads;
CREATE POLICY floating_leads_sale_update_scope ON public.floating_leads
FOR UPDATE TO authenticated
USING (
  public.has_role('sale')
  AND public.is_active_user()
  AND (
    assigned_sale_id IS NULL
    OR assigned_sale_id = public.get_current_profile_id()
  )
)
WITH CHECK (
  public.has_role('sale')
  AND public.is_active_user()
  AND assigned_sale_id = public.get_current_profile_id()
);

NOTIFY pgrst, 'reload schema';
