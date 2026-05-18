CREATE TABLE IF NOT EXISTS public.salary_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  revenue_min numeric NOT NULL DEFAULT 0,
  revenue_max numeric,
  base_salary numeric NOT NULL DEFAULT 0,
  milestone_bonus numeric NOT NULL DEFAULT 0,
  over_kpi_bonus numeric NOT NULL DEFAULT 0,
  commission_rate_month numeric,
  commission_rate_year numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salary_rules_role_check CHECK (role IN ('employee', 'leader', 'manager')),
  CONSTRAINT salary_rules_range_check CHECK (revenue_max IS NULL OR revenue_max > revenue_min)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_rules_unique_active_range
  ON public.salary_rules(role, revenue_min, COALESCE(revenue_max, -1))
  WHERE is_active = true;

DROP TRIGGER IF EXISTS tr_salary_rules_updated ON public.salary_rules;
CREATE TRIGGER tr_salary_rules_updated
  BEFORE UPDATE ON public.salary_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.salary_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS salary_rules_select_active ON public.salary_rules;
CREATE POLICY salary_rules_select_active ON public.salary_rules
  FOR SELECT TO authenticated
  USING (
    is_active = true
    OR public.has_role('admin'::public.app_role)
    OR public.is_manager()
  );

DROP POLICY IF EXISTS salary_rules_admin_manager_manage ON public.salary_rules;
CREATE POLICY salary_rules_admin_manager_manage ON public.salary_rules
  FOR ALL TO authenticated
  USING (
    public.has_role('admin'::public.app_role)
    OR public.is_manager()
  )
  WITH CHECK (
    public.has_role('admin'::public.app_role)
    OR public.is_manager()
  );

WITH seed(role, revenue_min, revenue_max, base_salary, milestone_bonus, over_kpi_bonus) AS (
  VALUES
    ('employee', 0::numeric, 100000000::numeric, 5700000::numeric, 0::numeric, 0::numeric),
    ('employee', 100000000::numeric, 150000000::numeric, 5700000::numeric, 800000::numeric, 300000::numeric),
    ('employee', 150000000::numeric, 200000000::numeric, 5700000::numeric, 1300000::numeric, 300000::numeric),
    ('employee', 200000000::numeric, NULL::numeric, 5700000::numeric, 2300000::numeric, 300000::numeric),
    ('leader', 0::numeric, 100000000::numeric, 5700000::numeric, 0::numeric, 0::numeric),
    ('leader', 100000000::numeric, 150000000::numeric, 5700000::numeric, 800000::numeric, 300000::numeric),
    ('leader', 150000000::numeric, 200000000::numeric, 5700000::numeric, 1300000::numeric, 300000::numeric),
    ('leader', 200000000::numeric, NULL::numeric, 5700000::numeric, 2300000::numeric, 300000::numeric)
)
INSERT INTO public.salary_rules (
  role,
  revenue_min,
  revenue_max,
  base_salary,
  milestone_bonus,
  over_kpi_bonus
)
SELECT
  seed.role,
  seed.revenue_min,
  seed.revenue_max,
  seed.base_salary,
  seed.milestone_bonus,
  seed.over_kpi_bonus
FROM seed
WHERE NOT EXISTS (
  SELECT 1
  FROM public.salary_rules existing
  WHERE existing.is_active = true
    AND existing.role = seed.role
    AND existing.revenue_min = seed.revenue_min
    AND COALESCE(existing.revenue_max, -1) = COALESCE(seed.revenue_max, -1)
);

NOTIFY pgrst, 'reload schema';
