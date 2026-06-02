CREATE TABLE IF NOT EXISTS public.marketing_ads_system_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'MKTRe System Token',
  access_token_encrypted text NOT NULL,
  token_type text NOT NULL DEFAULT 'system_user',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_ads_system_tokens_token_type_check CHECK (
    token_type IN ('system_user')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_ads_system_tokens_one_active
  ON public.marketing_ads_system_tokens(is_active)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS tr_marketing_ads_system_tokens_updated
  ON public.marketing_ads_system_tokens;
CREATE TRIGGER tr_marketing_ads_system_tokens_updated
BEFORE UPDATE ON public.marketing_ads_system_tokens
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE VIEW public.marketing_ads_system_tokens_public
WITH (security_invoker = true)
AS
SELECT
  token.id,
  token.name,
  token.token_type,
  token.is_active,
  token.created_at,
  token.updated_at,
  token.created_by,
  creator.full_name AS created_by_name,
  creator.username AS created_by_username,
  token.updated_by,
  updater.full_name AS updated_by_name,
  updater.username AS updated_by_username
FROM public.marketing_ads_system_tokens token
LEFT JOIN public.profiles creator
  ON creator.id = token.created_by
LEFT JOIN public.profiles updater
  ON updater.id = token.updated_by;

ALTER TABLE public.marketing_ads_system_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_ads_system_tokens_admin_select_metadata
  ON public.marketing_ads_system_tokens;
CREATE POLICY marketing_ads_system_tokens_admin_select_metadata
ON public.marketing_ads_system_tokens
FOR SELECT
TO authenticated
USING (
  public.is_active_user()
  AND public.has_role('admin'::public.app_role)
);

REVOKE ALL ON TABLE public.marketing_ads_system_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.marketing_ads_system_tokens_public FROM anon, authenticated;

GRANT SELECT (
  id,
  name,
  token_type,
  is_active,
  created_at,
  updated_at,
  created_by,
  updated_by
) ON public.marketing_ads_system_tokens TO authenticated;

GRANT SELECT ON public.marketing_ads_system_tokens_public TO authenticated;

NOTIFY pgrst, 'reload schema';
