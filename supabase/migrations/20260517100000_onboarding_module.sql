CREATE TABLE IF NOT EXISTS public.onboarding_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.onboarding_sections(id) ON DELETE CASCADE,
  icon text,
  title text NOT NULL,
  summary text,
  content text,
  image_url text,
  link_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_card_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.onboarding_cards(id) ON DELETE CASCADE,
  accepted_commitment boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, card_id)
);

CREATE TABLE IF NOT EXISTS public.onboarding_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.onboarding_sections(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_questions_type_check CHECK (question_type IN ('text', 'multiple_choice', 'checkbox'))
);

CREATE TABLE IF NOT EXISTS public.onboarding_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.onboarding_sections(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, section_id)
);

CREATE TABLE IF NOT EXISTS public.onboarding_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  link_url text,
  document_type text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_sections_active_sort
  ON public.onboarding_sections(is_active, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_cards_section_sort
  ON public.onboarding_cards(section_id, is_active, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_card_progress_profile
  ON public.onboarding_card_progress(profile_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_questions_section_sort
  ON public.onboarding_questions(section_id, is_active, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_answers_profile_section
  ON public.onboarding_answers(profile_id, section_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_documents_active_sort
  ON public.onboarding_documents(is_active, sort_order, created_at);

INSERT INTO public.onboarding_sections (section_key, title, description, sort_order)
VALUES
  ('intro', 'Giới thiệu', 'Nền tảng, văn hóa và cách vận hành cơ bản.', 1),
  ('training', 'Đào tạo', 'Các kiến thức cần hoàn thành trong giai đoạn đầu.', 2),
  ('advanced', 'Nâng cao', 'Quy trình nâng cao và tiêu chuẩn thực chiến.', 3)
ON CONFLICT (section_key) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

DROP TRIGGER IF EXISTS tr_onboarding_sections_updated ON public.onboarding_sections;
CREATE TRIGGER tr_onboarding_sections_updated
  BEFORE UPDATE ON public.onboarding_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_onboarding_cards_updated ON public.onboarding_cards;
CREATE TRIGGER tr_onboarding_cards_updated
  BEFORE UPDATE ON public.onboarding_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_onboarding_card_progress_updated ON public.onboarding_card_progress;
CREATE TRIGGER tr_onboarding_card_progress_updated
  BEFORE UPDATE ON public.onboarding_card_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_onboarding_questions_updated ON public.onboarding_questions;
CREATE TRIGGER tr_onboarding_questions_updated
  BEFORE UPDATE ON public.onboarding_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_onboarding_answers_updated ON public.onboarding_answers;
CREATE TRIGGER tr_onboarding_answers_updated
  BEFORE UPDATE ON public.onboarding_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_onboarding_documents_updated ON public.onboarding_documents;
CREATE TRIGGER tr_onboarding_documents_updated
  BEFORE UPDATE ON public.onboarding_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.onboarding_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_card_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_sections_select" ON public.onboarding_sections;
CREATE POLICY "onboarding_sections_select" ON public.onboarding_sections
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role('admin'::app_role));

DROP POLICY IF EXISTS "onboarding_sections_admin_all" ON public.onboarding_sections;
CREATE POLICY "onboarding_sections_admin_all" ON public.onboarding_sections
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (public.has_role('admin'::app_role));

DROP POLICY IF EXISTS "onboarding_cards_select" ON public.onboarding_cards;
CREATE POLICY "onboarding_cards_select" ON public.onboarding_cards
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role('admin'::app_role));

DROP POLICY IF EXISTS "onboarding_cards_admin_all" ON public.onboarding_cards;
CREATE POLICY "onboarding_cards_admin_all" ON public.onboarding_cards
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (public.has_role('admin'::app_role));

DROP POLICY IF EXISTS "onboarding_questions_select" ON public.onboarding_questions;
CREATE POLICY "onboarding_questions_select" ON public.onboarding_questions
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role('admin'::app_role));

DROP POLICY IF EXISTS "onboarding_questions_admin_all" ON public.onboarding_questions;
CREATE POLICY "onboarding_questions_admin_all" ON public.onboarding_questions
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (public.has_role('admin'::app_role));

DROP POLICY IF EXISTS "onboarding_documents_select" ON public.onboarding_documents;
CREATE POLICY "onboarding_documents_select" ON public.onboarding_documents
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role('admin'::app_role));

DROP POLICY IF EXISTS "onboarding_documents_admin_all" ON public.onboarding_documents;
CREATE POLICY "onboarding_documents_admin_all" ON public.onboarding_documents
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role))
  WITH CHECK (public.has_role('admin'::app_role));

DROP POLICY IF EXISTS "onboarding_progress_select" ON public.onboarding_card_progress;
CREATE POLICY "onboarding_progress_select" ON public.onboarding_card_progress
  FOR SELECT TO authenticated
  USING (
    profile_id = public.get_current_profile_id()
    OR public.has_role('admin'::app_role)
    OR public.has_role('manager'::app_role)
    OR public.has_role('leader'::app_role)
  );

DROP POLICY IF EXISTS "onboarding_progress_owner_insert" ON public.onboarding_card_progress;
CREATE POLICY "onboarding_progress_owner_insert" ON public.onboarding_card_progress
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "onboarding_progress_owner_update" ON public.onboarding_card_progress;
CREATE POLICY "onboarding_progress_owner_update" ON public.onboarding_card_progress
  FOR UPDATE TO authenticated
  USING (profile_id = public.get_current_profile_id())
  WITH CHECK (profile_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "onboarding_answers_select" ON public.onboarding_answers;
CREATE POLICY "onboarding_answers_select" ON public.onboarding_answers
  FOR SELECT TO authenticated
  USING (
    profile_id = public.get_current_profile_id()
    OR public.has_role('admin'::app_role)
    OR public.has_role('manager'::app_role)
    OR public.has_role('leader'::app_role)
  );

DROP POLICY IF EXISTS "onboarding_answers_owner_insert" ON public.onboarding_answers;
CREATE POLICY "onboarding_answers_owner_insert" ON public.onboarding_answers
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "onboarding_answers_owner_update" ON public.onboarding_answers;
CREATE POLICY "onboarding_answers_owner_update" ON public.onboarding_answers
  FOR UPDATE TO authenticated
  USING (profile_id = public.get_current_profile_id())
  WITH CHECK (profile_id = public.get_current_profile_id());

NOTIFY pgrst, 'reload schema';
