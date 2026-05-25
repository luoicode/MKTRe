ALTER TABLE public.onboarding_documents
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'marketing',
  ADD COLUMN IF NOT EXISTS file_type text NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE public.onboarding_documents
  ALTER COLUMN department SET DEFAULT 'marketing';

UPDATE public.onboarding_documents
SET department = 'marketing'
WHERE department IS NULL;

ALTER TABLE public.onboarding_documents
  ALTER COLUMN department SET NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_onboarding_documents_department_active
  ON public.onboarding_documents(department, is_active, sort_order, updated_at DESC);

INSERT INTO public.onboarding_documents (
  title,
  description,
  link_url,
  document_type,
  file_type,
  department,
  sort_order,
  is_active,
  is_pinned
)
SELECT *
FROM (
  VALUES
    (
      'Quy trình nhận lead Sale',
      'Luồng nhận data từ Kho thả nổi, kiểm tra Odoo và cập nhật tình trạng sau từng lần gọi.',
      NULL,
      'Quy trình',
      'announcement',
      'sale',
      10,
      true,
      true
    ),
    (
      'Script gọi lần 1-2-3',
      'Mẫu hội thoại cho lần gọi đầu, lần follow và lần xử lý khách cân nhắc.',
      NULL,
      'Script',
      'docx',
      'sale',
      20,
      true,
      true
    ),
    (
      'Checklist chốt Sale',
      'Checklist xác nhận thông tin khách, đơn hàng, trạng thái Odoo và báo cáo cuối ca.',
      NULL,
      'Checklist',
      'pdf',
      'sale',
      30,
      true,
      false
    ),
    (
      'Link Odoo',
      'Link hệ thống Odoo dùng để kiểm tra trạng thái khách trước khi gọi.',
      NULL,
      'Link hệ thống',
      'link',
      'sale',
      40,
      true,
      true
    )
) AS seed(title, description, link_url, document_type, file_type, department, sort_order, is_active, is_pinned)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.onboarding_documents existing
  WHERE existing.department = seed.department
    AND existing.title = seed.title
);

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
