CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  asset_value text NOT NULL,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixed_assets_type_check CHECK (asset_type IN ('hotline', 'odoo')),
  CONSTRAINT fixed_assets_user_type_key UNIQUE (user_id, asset_type)
);

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tr_fixed_assets_updated ON public.fixed_assets;
CREATE TRIGGER tr_fixed_assets_updated
  BEFORE UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS fixed_assets_admin_all ON public.fixed_assets;
CREATE POLICY fixed_assets_admin_all ON public.fixed_assets
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (public.has_role('admin'::app_role));

DROP POLICY IF EXISTS fixed_assets_self_select ON public.fixed_assets;
CREATE POLICY fixed_assets_self_select ON public.fixed_assets
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_profile_id());

CREATE INDEX IF NOT EXISTS idx_fixed_assets_user
  ON public.fixed_assets(user_id);

NOTIFY pgrst, 'reload schema';
