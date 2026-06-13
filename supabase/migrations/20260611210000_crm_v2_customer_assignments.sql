-- CRM V2 customer assignment history.
-- This migration creates the assignment ledger in parallel with the current CRM
-- tables and backfills assignment snapshots from existing customers only.

CREATE TABLE IF NOT EXISTS public.customer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  from_sale_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  from_sale_name text,
  from_sale_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  from_sale_team_name text,
  to_sale_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_sale_name text,
  to_sale_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  to_sale_team_name text,
  assignment_type text NOT NULL,
  reason text,
  note text,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_by_name text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_assignments_type_check CHECK (
    assignment_type IN (
      'auto_assign',
      'manual_assign',
      'transfer_sale',
      'transfer_team',
      'resale_assign'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_customer_assignments_customer_id
  ON public.customer_assignments(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_assignments_to_sale_id
  ON public.customer_assignments(to_sale_id);

CREATE INDEX IF NOT EXISTS idx_customer_assignments_to_sale_team_id
  ON public.customer_assignments(to_sale_team_id);

CREATE INDEX IF NOT EXISTS idx_customer_assignments_assigned_at
  ON public.customer_assignments(assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_assignments_assignment_type
  ON public.customer_assignments(assignment_type);

ALTER TABLE public.customer_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_assignments_accessible_customer_select ON public.customer_assignments;
CREATE POLICY customer_assignments_accessible_customer_select
ON public.customer_assignments
FOR SELECT
TO authenticated
USING (public.crm_v2_can_access_customer(customer_id));

DROP POLICY IF EXISTS customer_assignments_admin_manager_insert ON public.customer_assignments;
CREATE POLICY customer_assignments_admin_manager_insert
ON public.customer_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
);

WITH assignment_rows AS (
  SELECT
    customers.id AS customer_id,
    customers.assigned_sale_id AS to_sale_id,
    CASE
      WHEN NULLIF(btrim(customers.assigned_sale_name), '') IS NULL THEN NULL
      WHEN btrim(customers.assigned_sale_name) IN ('Đang tự động chia', 'Chưa phân phối', '—', '-') THEN NULL
      ELSE btrim(customers.assigned_sale_name)
    END AS to_sale_name,
    customers.sale_team_id AS to_sale_team_id,
    CASE
      WHEN NULLIF(btrim(customers.sale_team_name), '') IS NULL THEN NULL
      WHEN btrim(customers.sale_team_name) IN ('Đang tự động chia', 'Chưa phân phối', '—', '-') THEN NULL
      ELSE btrim(customers.sale_team_name)
    END AS to_sale_team_name,
    'manual_assign'::text AS assignment_type,
    'Backfill từ marketing_contacts'::text AS reason,
    'Hệ thống'::text AS assigned_by_name,
    COALESCE(customers.updated_at, customers.created_at, now()) AS assigned_at
  FROM public.customers customers
),
valid_assignment_rows AS (
  SELECT *
  FROM assignment_rows
  WHERE to_sale_id IS NOT NULL
    OR to_sale_name IS NOT NULL
    OR to_sale_team_id IS NOT NULL
    OR to_sale_team_name IS NOT NULL
)
INSERT INTO public.customer_assignments (
  customer_id,
  to_sale_id,
  to_sale_name,
  to_sale_team_id,
  to_sale_team_name,
  assignment_type,
  reason,
  assigned_by_name,
  assigned_at,
  created_at
)
SELECT
  customer_id,
  to_sale_id,
  to_sale_name,
  to_sale_team_id,
  to_sale_team_name,
  assignment_type,
  reason,
  assigned_by_name,
  assigned_at,
  assigned_at
FROM valid_assignment_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customer_assignments existing_assignments
  WHERE existing_assignments.customer_id = valid_assignment_rows.customer_id
    AND existing_assignments.to_sale_name IS NOT DISTINCT FROM valid_assignment_rows.to_sale_name
    AND existing_assignments.to_sale_team_name IS NOT DISTINCT FROM valid_assignment_rows.to_sale_team_name
    AND existing_assignments.assignment_type = valid_assignment_rows.assignment_type
    AND existing_assignments.assigned_at = valid_assignment_rows.assigned_at
);

WITH assignment_rows AS (
  SELECT
    customers.id AS customer_id,
    CASE
      WHEN NULLIF(btrim(customers.assigned_sale_name), '') IS NULL THEN NULL
      WHEN btrim(customers.assigned_sale_name) IN ('Đang tự động chia', 'Chưa phân phối', '—', '-') THEN NULL
      ELSE btrim(customers.assigned_sale_name)
    END AS to_sale_name,
    CASE
      WHEN NULLIF(btrim(customers.sale_team_name), '') IS NULL THEN NULL
      WHEN btrim(customers.sale_team_name) IN ('Đang tự động chia', 'Chưa phân phối', '—', '-') THEN NULL
      ELSE btrim(customers.sale_team_name)
    END AS to_sale_team_name,
    COALESCE(customers.updated_at, customers.created_at, now()) AS assigned_at
  FROM public.customers customers
),
activity_rows AS (
  SELECT
    customer_id,
    'assigned_sale'::text AS activity_type,
    'Backfill phân phối Sale: '
      || COALESCE(to_sale_name, '—')
      || ' / '
      || COALESCE(to_sale_team_name, '—') AS description,
    'Hệ thống'::text AS actor_name,
    assigned_at AS created_at
  FROM assignment_rows
  WHERE to_sale_name IS NOT NULL
    OR to_sale_team_name IS NOT NULL
)
INSERT INTO public.customer_activities (
  customer_id,
  activity_type,
  description,
  actor_id,
  actor_name,
  created_at
)
SELECT
  customer_id,
  activity_type,
  description,
  NULL::uuid,
  actor_name,
  created_at
FROM activity_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customer_activities existing_activities
  WHERE existing_activities.customer_id = activity_rows.customer_id
    AND existing_activities.activity_type = activity_rows.activity_type
    AND existing_activities.description IS NOT DISTINCT FROM activity_rows.description
);

-- Verification queries:
-- SELECT count(*) AS customer_assignments_count FROM public.customer_assignments;
-- SELECT * FROM public.customer_assignments ORDER BY assigned_at DESC LIMIT 20;

NOTIFY pgrst, 'reload schema';
