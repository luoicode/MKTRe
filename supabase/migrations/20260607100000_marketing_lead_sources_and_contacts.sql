CREATE TABLE IF NOT EXISTS public.lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_token text NOT NULL UNIQUE,
  name text NOT NULL,
  product text NOT NULL DEFAULT 'NOTRIGOLD',
  channel text NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_sources_owner
ON public.lead_sources(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_lead_sources_token
ON public.lead_sources(source_token);

CREATE INDEX IF NOT EXISTS idx_lead_sources_team
ON public.lead_sources(team_id);

DROP TRIGGER IF EXISTS tr_lead_sources_updated ON public.lead_sources;
CREATE TRIGGER tr_lead_sources_updated
BEFORE UPDATE ON public.lead_sources
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.marketing_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_source_id uuid REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  source_token text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  customer_name text,
  phone text NOT NULL,
  normalized_phone text NOT NULL,
  email text,
  message text,
  landing_url text,
  campaign_name text,
  adset_name text,
  ad_name text,
  source_name text,
  source_channel text,
  sales_owner_name text NOT NULL DEFAULT 'Đang tự động chia',
  sales_team_name text NOT NULL DEFAULT 'Đang tự động chia',
  status text NOT NULL DEFAULT 'new',
  is_duplicate boolean NOT NULL DEFAULT false,
  duplicate_scope text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_owner_created
ON public.marketing_contacts(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_source_created
ON public.marketing_contacts(lead_source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_normalized_phone
ON public.marketing_contacts(normalized_phone);

DROP TRIGGER IF EXISTS tr_marketing_contacts_updated ON public.marketing_contacts;
CREATE TRIGGER tr_marketing_contacts_updated
BEFORE UPDATE ON public.marketing_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_sources_admin_all ON public.lead_sources;
CREATE POLICY lead_sources_admin_all
ON public.lead_sources
FOR ALL
TO authenticated
USING (public.has_role('admin'::public.app_role))
WITH CHECK (public.has_role('admin'::public.app_role));

DROP POLICY IF EXISTS lead_sources_owner_select ON public.lead_sources;
CREATE POLICY lead_sources_owner_select
ON public.lead_sources
FOR SELECT
TO authenticated
USING (owner_user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS lead_sources_owner_insert ON public.lead_sources;
CREATE POLICY lead_sources_owner_insert
ON public.lead_sources
FOR INSERT
TO authenticated
WITH CHECK (
  owner_user_id = public.get_current_profile_id()
  AND public.has_role('employee'::public.app_role)
  AND public.is_active_user()
);

DROP POLICY IF EXISTS lead_sources_owner_update ON public.lead_sources;
CREATE POLICY lead_sources_owner_update
ON public.lead_sources
FOR UPDATE
TO authenticated
USING (owner_user_id = public.get_current_profile_id())
WITH CHECK (owner_user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS marketing_contacts_admin_all ON public.marketing_contacts;
CREATE POLICY marketing_contacts_admin_all
ON public.marketing_contacts
FOR ALL
TO authenticated
USING (public.has_role('admin'::public.app_role))
WITH CHECK (public.has_role('admin'::public.app_role));

DROP POLICY IF EXISTS marketing_contacts_owner_select ON public.marketing_contacts;
CREATE POLICY marketing_contacts_owner_select
ON public.marketing_contacts
FOR SELECT
TO authenticated
USING (owner_user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS marketing_contacts_owner_insert ON public.marketing_contacts;
CREATE POLICY marketing_contacts_owner_insert
ON public.marketing_contacts
FOR INSERT
TO authenticated
WITH CHECK (
  owner_user_id = public.get_current_profile_id()
  AND public.has_role('employee'::public.app_role)
  AND public.is_active_user()
);

NOTIFY pgrst, 'reload schema';
