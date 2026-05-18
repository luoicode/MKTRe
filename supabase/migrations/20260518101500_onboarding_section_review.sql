-- Add review workflow for onboarding section answers.

ALTER TABLE public.onboarding_answers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

ALTER TABLE public.onboarding_answers
  DROP CONSTRAINT IF EXISTS onboarding_answers_status_check;

ALTER TABLE public.onboarding_answers
  ADD CONSTRAINT onboarding_answers_status_check
  CHECK (status IN ('locked', 'open', 'submitted', 'approved', 'rejected'));

UPDATE public.onboarding_answers
SET status = 'approved'
WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_answers_status_section
  ON public.onboarding_answers(status, section_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_answers_reviewed_by
  ON public.onboarding_answers(reviewed_by);

DROP POLICY IF EXISTS "onboarding_answers_reviewer_update" ON public.onboarding_answers;
CREATE POLICY "onboarding_answers_reviewer_update" ON public.onboarding_answers
  FOR UPDATE TO authenticated
  USING (
    public.has_role('admin'::app_role)
    OR public.has_role('manager'::app_role)
    OR (
      public.has_role('leader'::app_role)
      AND EXISTS (
        SELECT 1
        FROM public.team_memberships leader_membership
        JOIN public.team_memberships employee_membership
          ON employee_membership.team_id = leader_membership.team_id
        WHERE leader_membership.user_id = public.get_current_profile_id()
          AND leader_membership.is_active = true
          AND employee_membership.user_id = onboarding_answers.profile_id
          AND employee_membership.is_active = true
      )
    )
  )
  WITH CHECK (
    public.has_role('admin'::app_role)
    OR public.has_role('manager'::app_role)
    OR (
      public.has_role('leader'::app_role)
      AND EXISTS (
        SELECT 1
        FROM public.team_memberships leader_membership
        JOIN public.team_memberships employee_membership
          ON employee_membership.team_id = leader_membership.team_id
        WHERE leader_membership.user_id = public.get_current_profile_id()
          AND leader_membership.is_active = true
          AND employee_membership.user_id = onboarding_answers.profile_id
          AND employee_membership.is_active = true
      )
    )
  );

NOTIFY pgrst, 'reload schema';
