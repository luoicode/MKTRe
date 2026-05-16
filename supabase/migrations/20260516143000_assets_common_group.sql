ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_group_check;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_group_check
  CHECK (asset_group IN ('common', 'fixed', 'flexible', 'personal'));

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
    asset_group = 'common'
    OR public.has_role('admin'::app_role)
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
