ALTER TABLE public.onboarding_documents
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint;

ALTER TABLE public.onboarding_documents
  DROP CONSTRAINT IF EXISTS onboarding_documents_file_type_check;

ALTER TABLE public.onboarding_documents
  ADD CONSTRAINT onboarding_documents_file_type_check
  CHECK (file_type IN ('pdf', 'docx', 'xlsx', 'image', 'link', 'announcement'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('training-documents', 'training-documents', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "training_documents_public_read" ON storage.objects;
CREATE POLICY "training_documents_public_read" ON storage.objects
FOR SELECT
USING (bucket_id = 'training-documents');

DROP POLICY IF EXISTS "training_documents_admin_leader_write" ON storage.objects;
CREATE POLICY "training_documents_admin_leader_write" ON storage.objects
FOR ALL
USING (
  bucket_id = 'training-documents'
  AND (
    public.has_role('admin')
    OR public.has_role('manager')
    OR public.has_role('leader')
    OR public.has_role('leader_sale')
  )
)
WITH CHECK (
  bucket_id = 'training-documents'
  AND (
    public.has_role('admin')
    OR public.has_role('manager')
    OR public.has_role('leader')
    OR public.has_role('leader_sale')
  )
);

NOTIFY pgrst, 'reload schema';
