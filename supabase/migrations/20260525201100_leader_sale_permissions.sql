UPDATE public.user_roles ur
SET role = 'leader_sale'::public.app_role
FROM public.team_memberships tm
JOIN public.teams t ON t.id = tm.team_id
WHERE ur.user_id = tm.user_id
  AND ur.role = 'sale'::public.app_role
  AND tm.is_active = true
  AND tm.role_in_team = 'leader'::public.team_member_role
  AND t.department = 'sale';

DROP POLICY IF EXISTS sale_reports_self_select ON public.sale_reports;
CREATE POLICY sale_reports_self_select ON public.sale_reports
FOR SELECT TO authenticated
USING (
  user_id = public.get_current_profile_id()
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
);

DROP POLICY IF EXISTS sale_reports_self_insert ON public.sale_reports;
CREATE POLICY sale_reports_self_insert ON public.sale_reports
FOR INSERT TO authenticated
WITH CHECK (
  user_id = public.get_current_profile_id()
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
  AND public.is_active_user()
);

DROP POLICY IF EXISTS sale_reports_self_update ON public.sale_reports;
CREATE POLICY sale_reports_self_update ON public.sale_reports
FOR UPDATE TO authenticated
USING (
  user_id = public.get_current_profile_id()
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
  AND status = 'draft'
)
WITH CHECK (
  user_id = public.get_current_profile_id()
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
  AND public.is_active_user()
);

DROP POLICY IF EXISTS floating_leads_sale_select_all ON public.floating_leads;
CREATE POLICY floating_leads_sale_select_all ON public.floating_leads
FOR SELECT TO authenticated
USING (
  (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
  AND public.is_active_user()
);

DROP POLICY IF EXISTS floating_leads_sale_update_scope ON public.floating_leads;
CREATE POLICY floating_leads_sale_update_scope ON public.floating_leads
FOR UPDATE TO authenticated
USING (
  (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
  AND public.is_active_user()
  AND (
    assigned_sale_id IS NULL
    OR assigned_sale_id = public.get_current_profile_id()
  )
)
WITH CHECK (
  (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
  AND public.is_active_user()
  AND assigned_sale_id = public.get_current_profile_id()
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
    AND (
      public.has_role('sale'::public.app_role)
      OR public.has_role('leader_sale'::public.app_role)
    )
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

CREATE OR REPLACE FUNCTION public.guard_floating_leads_sale_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id uuid := public.get_current_profile_id();
  current_call_slot integer := LEAST(GREATEST(OLD.claim_count + 1, 1), 3);
  is_sale_actor boolean := public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role);
BEGIN
  IF current_setting('app.releasing_floating_leads', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF is_sale_actor AND NOT (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role)) THEN
    IF OLD.is_closed THEN
      RAISE EXCEPTION 'Lead already closed';
    END IF;

    IF NEW.phone IS DISTINCT FROM OLD.phone
      OR NEW.source IS DISTINCT FROM OLD.source
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_by_name IS DISTINCT FROM OLD.created_by_name
      OR NEW.lead_date IS DISTINCT FROM OLD.lead_date
      OR NEW.claim_count IS DISTINCT FROM OLD.claim_count
      OR NEW.blocked_sale_ids IS DISTINCT FROM OLD.blocked_sale_ids THEN
      RAISE EXCEPTION 'Sale cannot update lead source fields';
    END IF;

    IF OLD.assigned_sale_id IS NOT NULL
      AND OLD.assigned_sale_id <> current_profile_id THEN
      RAISE EXCEPTION 'Lead already assigned';
    END IF;

    IF OLD.assigned_sale_id IS NULL THEN
      IF OLD.claim_count >= 3 THEN
        RAISE EXCEPTION 'Lead already processed 3 times';
      END IF;

      IF NEW.assigned_sale_id <> current_profile_id THEN
        RAISE EXCEPTION 'Sale can only claim for self';
      END IF;

      IF current_profile_id = ANY(OLD.blocked_sale_ids) THEN
        RAISE EXCEPTION 'You have processed this lead before';
      END IF;

      IF NEW.call_1 IS DISTINCT FROM OLD.call_1
        OR NEW.call_2 IS DISTINCT FROM OLD.call_2
        OR NEW.call_3 IS DISTINCT FROM OLD.call_3
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.note IS DISTINCT FROM OLD.note
        OR NEW.is_closed IS DISTINCT FROM OLD.is_closed
        OR NEW.closed_by IS DISTINCT FROM OLD.closed_by
        OR NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
        RAISE EXCEPTION 'Sale can only claim lead at this step';
      END IF;
    END IF;

    IF OLD.assigned_sale_id IS NOT NULL
      AND NEW.assigned_sale_id IS DISTINCT FROM OLD.assigned_sale_id THEN
      RAISE EXCEPTION 'Cannot reassign claimed lead';
    END IF;

    IF OLD.assigned_sale_id IS NOT NULL THEN
      IF current_call_slot = 1
        AND (NEW.call_2 IS DISTINCT FROM OLD.call_2 OR NEW.call_3 IS DISTINCT FROM OLD.call_3) THEN
        RAISE EXCEPTION 'Sale can only update call 1 for this lead';
      END IF;

      IF current_call_slot = 2
        AND (NEW.call_1 IS DISTINCT FROM OLD.call_1 OR NEW.call_3 IS DISTINCT FROM OLD.call_3) THEN
        RAISE EXCEPTION 'Sale can only update call 2 for this lead';
      END IF;

      IF current_call_slot = 3
        AND (NEW.call_1 IS DISTINCT FROM OLD.call_1 OR NEW.call_2 IS DISTINCT FROM OLD.call_2) THEN
        RAISE EXCEPTION 'Sale can only update call 3 for this lead';
      END IF;

      IF NEW.note IS DISTINCT FROM OLD.note THEN
        RAISE EXCEPTION 'Sale cannot update shared note';
      END IF;
    END IF;

    IF NEW.is_closed THEN
      IF OLD.assigned_sale_id <> current_profile_id THEN
        RAISE EXCEPTION 'Only assigned sale can close lead';
      END IF;

      IF NEW.closed_by IS DISTINCT FROM current_profile_id THEN
        RAISE EXCEPTION 'Invalid closed_by';
      END IF;

      IF NEW.closed_at IS NULL THEN
        RAISE EXCEPTION 'closed_at is required';
      END IF;
    ELSE
      IF NEW.closed_by IS DISTINCT FROM OLD.closed_by
        OR NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
        RAISE EXCEPTION 'Invalid close fields';
      END IF;
    END IF;
  END IF;

  IF public.has_role('employee'::public.app_role) AND NOT (public.has_role('admin'::public.app_role) OR public.has_role('manager'::public.app_role)) THEN
    IF OLD.created_by <> current_profile_id THEN
      RAISE EXCEPTION 'Marketing can only update own leads';
    END IF;

    IF OLD.assigned_sale_id IS NOT NULL THEN
      RAISE EXCEPTION 'Lead already assigned';
    END IF;

    IF NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_by_name IS DISTINCT FROM OLD.created_by_name
      OR NEW.assigned_sale_id IS DISTINCT FROM OLD.assigned_sale_id
      OR NEW.assigned_sale_name IS DISTINCT FROM OLD.assigned_sale_name
      OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
      OR NEW.call_1 IS DISTINCT FROM OLD.call_1
      OR NEW.call_2 IS DISTINCT FROM OLD.call_2
      OR NEW.call_3 IS DISTINCT FROM OLD.call_3
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.note IS DISTINCT FROM OLD.note
      OR NEW.claim_count IS DISTINCT FROM OLD.claim_count
      OR NEW.blocked_sale_ids IS DISTINCT FROM OLD.blocked_sale_ids
      OR NEW.last_claimed_at IS DISTINCT FROM OLD.last_claimed_at
      OR NEW.closed_by IS DISTINCT FROM OLD.closed_by
      OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
      OR NEW.is_closed IS DISTINCT FROM OLD.is_closed THEN
      RAISE EXCEPTION 'Marketing can only update lead source fields before assignment';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_expired_floating_leads_for_sale(p_sale_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  released_count integer := 0;
  today_start timestamptz := (((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
BEGIN
  IF NOT (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  ) OR p_sale_id <> public.get_current_profile_id() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  PERFORM set_config('app.releasing_floating_leads', 'true', true);

  UPDATE public.floating_leads
  SET
    blocked_sale_ids = CASE
      WHEN assigned_sale_id = ANY(blocked_sale_ids) THEN blocked_sale_ids
      ELSE array_append(blocked_sale_ids, assigned_sale_id)
    END,
    assigned_sale_id = NULL,
    assigned_sale_name = NULL,
    assigned_at = NULL,
    claim_count = claim_count + 1,
    updated_at = now()
  WHERE assigned_sale_id IS NOT NULL
    AND is_closed = false
    AND assigned_at IS NOT NULL
    AND assigned_at < today_start;

  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
