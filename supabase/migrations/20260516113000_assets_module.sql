CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_group text NOT NULL,
  asset_type text NOT NULL,
  title text NOT NULL,
  value text,
  link_url text,
  description text,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assets_group_check CHECK (asset_group IN ('fixed', 'flexible', 'personal'))
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tr_assets_updated ON public.assets;
CREATE TRIGGER tr_assets_updated
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_assets_group ON public.assets(asset_group);
CREATE INDEX IF NOT EXISTS idx_assets_owner_profile ON public.assets(owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_assets_owner_team ON public.assets(owner_team_id);
CREATE INDEX IF NOT EXISTS idx_assets_assigned_by ON public.assets(assigned_by);
CREATE INDEX IF NOT EXISTS idx_assets_created_by ON public.assets(created_by);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_fixed_user_type
  ON public.assets(owner_profile_id, asset_type)
  WHERE asset_group = 'fixed';

INSERT INTO public.assets (
  asset_group,
  asset_type,
  title,
  value,
  owner_profile_id,
  assigned_by,
  created_by,
  created_at,
  updated_at,
  is_active
)
SELECT
  'fixed',
  fa.asset_type,
  CASE fa.asset_type WHEN 'hotline' THEN 'Hotline' ELSE 'Tài khoản Odoo' END,
  fa.asset_value,
  fa.user_id,
  fa.assigned_by,
  COALESCE(fa.assigned_by, fa.user_id),
  fa.assigned_at,
  fa.updated_at,
  true
FROM public.fixed_assets fa
WHERE NOT EXISTS (
  SELECT 1
  FROM public.assets a
  WHERE a.asset_group = 'fixed'
    AND a.asset_type = fa.asset_type
    AND a.owner_profile_id = fa.user_id
);

CREATE OR REPLACE FUNCTION public.can_write_asset(
  _asset_group text,
  _owner_profile_id uuid,
  _owner_team_id uuid,
  _created_by uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role('admin'::app_role)
    OR (
      _asset_group = 'flexible'
      AND _owner_team_id IS NOT NULL
      AND public.can_manage_team_kpi(_owner_team_id)
      AND (
        _owner_profile_id IS NULL
        OR public.user_active_in_team(_owner_profile_id, _owner_team_id)
      )
    )
    OR (
      _asset_group = 'personal'
      AND _created_by = public.get_current_profile_id()
      AND _owner_profile_id = public.get_current_profile_id()
    );
$$;

DROP POLICY IF EXISTS assets_select ON public.assets;
CREATE POLICY assets_select ON public.assets
  FOR SELECT TO authenticated
  USING (
    public.has_role('admin'::app_role)
    OR created_by = public.get_current_profile_id()
    OR owner_profile_id = public.get_current_profile_id()
    OR (owner_team_id IS NOT NULL AND public.can_view_team(owner_team_id))
  );

DROP POLICY IF EXISTS assets_insert ON public.assets;
CREATE POLICY assets_insert ON public.assets
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.get_current_profile_id()
    AND public.can_write_asset(asset_group, owner_profile_id, owner_team_id, created_by)
  );

DROP POLICY IF EXISTS assets_update ON public.assets;
CREATE POLICY assets_update ON public.assets
  FOR UPDATE TO authenticated
  USING (public.can_write_asset(asset_group, owner_profile_id, owner_team_id, created_by))
  WITH CHECK (public.can_write_asset(asset_group, owner_profile_id, owner_team_id, created_by));

DROP POLICY IF EXISTS assets_delete ON public.assets;
CREATE POLICY assets_delete ON public.assets
  FOR DELETE TO authenticated
  USING (public.can_write_asset(asset_group, owner_profile_id, owner_team_id, created_by));

NOTIFY pgrst, 'reload schema';
