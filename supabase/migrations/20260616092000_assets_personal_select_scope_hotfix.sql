-- Keep personal assets private to their owner. Team visibility must not expose
-- another user's personal asset, while common/team assets keep their current scope.

DROP POLICY IF EXISTS assets_select ON public.assets;

CREATE POLICY assets_select ON public.assets
  FOR SELECT TO authenticated
  USING (
    asset_group = 'common'
    OR public.has_role('admin'::app_role)
    OR owner_profile_id = public.get_current_profile_id()
    OR created_by = public.get_current_profile_id()
    OR (
      asset_group <> 'personal'
      AND owner_team_id IS NOT NULL
      AND public.can_view_team(owner_team_id)
    )
  );

NOTIFY pgrst, 'reload schema';
