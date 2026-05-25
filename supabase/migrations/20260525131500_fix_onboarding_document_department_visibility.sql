ALTER TABLE public.onboarding_documents
  ADD COLUMN IF NOT EXISTS department text DEFAULT 'marketing',
  ADD COLUMN IF NOT EXISTS file_type text DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;

ALTER TABLE public.onboarding_documents
  ALTER COLUMN department SET DEFAULT 'marketing',
  ALTER COLUMN file_type SET DEFAULT 'link',
  ALTER COLUMN is_pinned SET DEFAULT false;

DO $$
DECLARE
  v_backfilled integer := 0;
BEGIN
  UPDATE public.onboarding_documents
  SET department = 'marketing'
  WHERE department IS NULL;

  GET DIAGNOSTICS v_backfilled = ROW_COUNT;
  RAISE NOTICE 'Backfilled onboarding_documents.department to marketing: % rows', v_backfilled;
END $$;

ALTER TABLE public.onboarding_documents
  DROP CONSTRAINT IF EXISTS onboarding_documents_department_check;

ALTER TABLE public.onboarding_documents
  ADD CONSTRAINT onboarding_documents_department_check
  CHECK (department IN ('marketing', 'sale'));

ALTER TABLE public.onboarding_documents
  DROP CONSTRAINT IF EXISTS onboarding_documents_file_type_check;

ALTER TABLE public.onboarding_documents
  ADD CONSTRAINT onboarding_documents_file_type_check
  CHECK (file_type IN ('pdf', 'docx', 'xlsx', 'link', 'announcement'));

ALTER TABLE public.onboarding_documents
  ALTER COLUMN department SET NOT NULL,
  ALTER COLUMN file_type SET NOT NULL,
  ALTER COLUMN is_pinned SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_documents_department_active
  ON public.onboarding_documents(department, is_active, sort_order, updated_at DESC);

DROP POLICY IF EXISTS "onboarding_documents_select" ON public.onboarding_documents;

CREATE POLICY "onboarding_documents_select" ON public.onboarding_documents
  FOR SELECT TO authenticated
  USING (
    public.has_role('admin'::public.app_role)
    OR public.has_role('manager'::public.app_role)
    OR (
      is_active = true
      AND department = 'sale'
      AND public.has_role('sale'::public.app_role)
    )
    OR (
      is_active = true
      AND COALESCE(department, 'marketing') = 'marketing'
      AND (
        public.has_role('employee'::public.app_role)
        OR public.has_role('leader'::public.app_role)
      )
    )
  );

NOTIFY pgrst, 'reload schema';
