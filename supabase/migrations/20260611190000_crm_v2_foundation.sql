-- CRM V2 foundation.
-- This migration only creates new parallel CRM tables. It does not modify,
-- backfill, or depend on legacy marketing_contacts/contact_notes data.

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code text NOT NULL DEFAULT ('CUS_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  customer_name text,
  phone text NOT NULL,
  normalized_phone text NOT NULL,
  phone_secondary text,
  email text,
  address text,
  status text NOT NULL DEFAULT 'new',
  customer_type text NOT NULL DEFAULT 'lead',
  assigned_sale_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_sale_name text,
  sale_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  sale_team_name text,
  last_contact_at timestamptz,
  next_followup_at timestamptz,
  contact_count integer NOT NULL DEFAULT 0,
  total_orders integer NOT NULL DEFAULT 0,
  completed_orders integer NOT NULL DEFAULT 0,
  completed_revenue numeric NOT NULL DEFAULT 0,
  lifetime_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_customer_code_unique UNIQUE (customer_code),
  CONSTRAINT customers_contact_count_non_negative CHECK (contact_count >= 0),
  CONSTRAINT customers_total_orders_non_negative CHECK (total_orders >= 0),
  CONSTRAINT customers_completed_orders_non_negative CHECK (completed_orders >= 0),
  CONSTRAINT customers_completed_revenue_non_negative CHECK (completed_revenue >= 0),
  CONSTRAINT customers_lifetime_value_non_negative CHECK (lifetime_value >= 0)
);

CREATE TABLE IF NOT EXISTS public.customer_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  lead_source_id uuid REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  source_name text,
  source_channel text,
  landing_url text,
  campaign_name text,
  adset_name text,
  ad_name text,
  marketer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  marketer_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.customer_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  description text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  order_code text,
  product_name text,
  quantity numeric NOT NULL DEFAULT 1,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new',
  order_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_orders_quantity_non_negative CHECK (quantity >= 0),
  CONSTRAINT customer_orders_amount_non_negative CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_customers_phone
  ON public.customers(phone);

CREATE INDEX IF NOT EXISTS idx_customers_normalized_phone
  ON public.customers(normalized_phone);

CREATE INDEX IF NOT EXISTS idx_customers_status
  ON public.customers(status);

CREATE INDEX IF NOT EXISTS idx_customers_assigned_sale
  ON public.customers(assigned_sale_id);

CREATE INDEX IF NOT EXISTS idx_customers_sale_team
  ON public.customers(sale_team_id);

CREATE INDEX IF NOT EXISTS idx_customer_sources_customer_id
  ON public.customer_sources(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_sources_lead_source
  ON public.customer_sources(lead_source_id);

CREATE INDEX IF NOT EXISTS idx_customer_sources_marketer
  ON public.customer_sources(marketer_id);

CREATE INDEX IF NOT EXISTS idx_customer_sources_channel
  ON public.customer_sources(source_channel);

CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id
  ON public.customer_notes(customer_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_notes_created_by
  ON public.customer_notes(created_by);

CREATE INDEX IF NOT EXISTS idx_customer_activities_customer_id
  ON public.customer_activities(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_activities_type
  ON public.customer_activities(activity_type);

CREATE INDEX IF NOT EXISTS idx_customer_orders_customer_id
  ON public.customer_orders(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_orders_status
  ON public.customer_orders(status);

DROP TRIGGER IF EXISTS tr_customers_updated_at ON public.customers;
CREATE TRIGGER tr_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tr_customer_notes_updated_at ON public.customer_notes;
CREATE TRIGGER tr_customer_notes_updated_at
  BEFORE UPDATE ON public.customer_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.crm_v2_can_access_customer(_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role('admin'::public.app_role)
    OR public.has_role('manager'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.customers customer
      WHERE customer.id = _customer_id
        AND customer.assigned_sale_id = public.get_current_profile_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.customer_sources source
      WHERE source.customer_id = _customer_id
        AND source.marketer_id = public.get_current_profile_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.customers customer
      JOIN public.teams team ON team.id = customer.sale_team_id
      WHERE customer.id = _customer_id
        AND team.leader_id = public.get_current_profile_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.customer_sources source
      JOIN public.teams team ON team.id = (
        SELECT profile_team.team_id
        FROM public.team_memberships profile_team
        WHERE profile_team.user_id = source.marketer_id
        LIMIT 1
      )
      WHERE source.customer_id = _customer_id
        AND team.leader_id = public.get_current_profile_id()
    );
$$;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_admin_manager_all ON public.customers;
CREATE POLICY customers_admin_manager_all
ON public.customers
FOR ALL
TO authenticated
USING (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
)
WITH CHECK (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
);

DROP POLICY IF EXISTS customers_assigned_sale_select ON public.customers;
CREATE POLICY customers_assigned_sale_select
ON public.customers
FOR SELECT
TO authenticated
USING (assigned_sale_id = public.get_current_profile_id());

DROP POLICY IF EXISTS customers_leader_sale_team_select ON public.customers;
CREATE POLICY customers_leader_sale_team_select
ON public.customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.teams team
    WHERE team.id = customers.sale_team_id
      AND team.leader_id = public.get_current_profile_id()
  )
);

DROP POLICY IF EXISTS customers_accessible_customer_select ON public.customers;
CREATE POLICY customers_accessible_customer_select
ON public.customers
FOR SELECT
TO authenticated
USING (public.crm_v2_can_access_customer(id));

DROP POLICY IF EXISTS customer_sources_accessible_customer_select ON public.customer_sources;
CREATE POLICY customer_sources_accessible_customer_select
ON public.customer_sources
FOR SELECT
TO authenticated
USING (public.crm_v2_can_access_customer(customer_id));

DROP POLICY IF EXISTS customer_sources_admin_manager_all ON public.customer_sources;
CREATE POLICY customer_sources_admin_manager_all
ON public.customer_sources
FOR ALL
TO authenticated
USING (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
)
WITH CHECK (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
);

DROP POLICY IF EXISTS customer_sources_marketer_insert ON public.customer_sources;
CREATE POLICY customer_sources_marketer_insert
ON public.customer_sources
FOR INSERT
TO authenticated
WITH CHECK (marketer_id = public.get_current_profile_id());

DROP POLICY IF EXISTS customer_notes_accessible_customer_select ON public.customer_notes;
CREATE POLICY customer_notes_accessible_customer_select
ON public.customer_notes
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND public.crm_v2_can_access_customer(customer_id)
);

DROP POLICY IF EXISTS customer_notes_admin_manager_all ON public.customer_notes;
CREATE POLICY customer_notes_admin_manager_all
ON public.customer_notes
FOR ALL
TO authenticated
USING (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
)
WITH CHECK (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
);

DROP POLICY IF EXISTS customer_notes_assigned_sale_insert ON public.customer_notes;
CREATE POLICY customer_notes_assigned_sale_insert
ON public.customer_notes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.customers customer
    WHERE customer.id = customer_notes.customer_id
      AND customer.assigned_sale_id = public.get_current_profile_id()
  )
);

DROP POLICY IF EXISTS customer_notes_assigned_sale_update ON public.customer_notes;
CREATE POLICY customer_notes_assigned_sale_update
ON public.customer_notes
FOR UPDATE
TO authenticated
USING (
  created_by = public.get_current_profile_id()
  OR EXISTS (
    SELECT 1
    FROM public.customers customer
    WHERE customer.id = customer_notes.customer_id
      AND customer.assigned_sale_id = public.get_current_profile_id()
  )
)
WITH CHECK (
  created_by = public.get_current_profile_id()
  OR EXISTS (
    SELECT 1
    FROM public.customers customer
    WHERE customer.id = customer_notes.customer_id
      AND customer.assigned_sale_id = public.get_current_profile_id()
  )
);

DROP POLICY IF EXISTS customer_activities_accessible_customer_select ON public.customer_activities;
CREATE POLICY customer_activities_accessible_customer_select
ON public.customer_activities
FOR SELECT
TO authenticated
USING (public.crm_v2_can_access_customer(customer_id));

DROP POLICY IF EXISTS customer_activities_admin_manager_all ON public.customer_activities;
CREATE POLICY customer_activities_admin_manager_all
ON public.customer_activities
FOR ALL
TO authenticated
USING (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
)
WITH CHECK (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
);

DROP POLICY IF EXISTS customer_activities_assigned_sale_insert ON public.customer_activities;
CREATE POLICY customer_activities_assigned_sale_insert
ON public.customer_activities
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.customers customer
    WHERE customer.id = customer_activities.customer_id
      AND customer.assigned_sale_id = public.get_current_profile_id()
  )
);

DROP POLICY IF EXISTS customer_orders_accessible_customer_select ON public.customer_orders;
CREATE POLICY customer_orders_accessible_customer_select
ON public.customer_orders
FOR SELECT
TO authenticated
USING (public.crm_v2_can_access_customer(customer_id));

DROP POLICY IF EXISTS customer_orders_admin_manager_all ON public.customer_orders;
CREATE POLICY customer_orders_admin_manager_all
ON public.customer_orders
FOR ALL
TO authenticated
USING (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
)
WITH CHECK (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
);
