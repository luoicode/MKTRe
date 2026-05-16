-- Allow employees and leaders to revise/resubmit their own submitted reports.
-- Approved/locked reports remain immutable for the reporter.

DROP POLICY IF EXISTS "reports_self_update" ON public.slot_reports;

CREATE POLICY "reports_self_update" ON public.slot_reports
  FOR UPDATE TO authenticated
  USING (
    user_id = public.get_current_profile_id()
    AND status IN ('draft', 'rejected', 'submitted')
  )
  WITH CHECK (
    user_id = public.get_current_profile_id()
    AND status IN ('draft', 'submitted')
  );
