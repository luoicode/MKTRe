-- Allow Leader Marketing to add floating leads for their own profile.
-- This keeps the same safety boundary as Marketing employee insert:
-- created_by must be the current profile and the lead cannot be pre-assigned.

DROP POLICY IF EXISTS floating_leads_marketing_insert_own ON public.floating_leads;

CREATE POLICY floating_leads_marketing_insert_own ON public.floating_leads
FOR INSERT TO authenticated
WITH CHECK (
  created_by = public.get_current_profile_id()
  AND assigned_sale_id IS NULL
  AND (
    public.has_role('employee')
    OR public.has_role('leader')
  )
  AND public.is_active_user()
);
