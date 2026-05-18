CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_leave_request_dedupe
ON public.notifications ((metadata ->> 'dedupe_key'))
WHERE type IN ('leave_request_created', 'leave_request_approved', 'leave_request_rejected')
  AND metadata ? 'dedupe_key';

CREATE OR REPLACE FUNCTION public.notify_leave_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_name text;
  v_team_id uuid;
  v_target record;
  v_dedupe_key text;
  v_start_label text := to_char(NEW.start_date::date, 'DD/MM/YYYY');
  v_end_label text := to_char(NEW.end_date::date, 'DD/MM/YYYY');
BEGIN
  SELECT COALESCE(full_name, username, 'Nhân sự')
  INTO v_requester_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  SELECT tm.team_id
  INTO v_team_id
  FROM public.team_memberships tm
  WHERE tm.user_id = NEW.user_id
    AND tm.is_active = true
  ORDER BY tm.created_at DESC NULLS LAST
  LIMIT 1;

  FOR v_target IN
    WITH requester_teams AS (
      SELECT tm.team_id
      FROM public.team_memberships tm
      WHERE tm.user_id = NEW.user_id
        AND tm.is_active = true
    ),
    leader_recipients AS (
      SELECT DISTINCT leader_membership.user_id AS profile_id
      FROM requester_teams rt
      JOIN public.team_memberships leader_membership
        ON leader_membership.team_id = rt.team_id
       AND leader_membership.is_active = true
      JOIN public.user_roles ur
        ON ur.user_id = leader_membership.user_id
       AND ur.role = 'leader'::public.app_role
      WHERE leader_membership.user_id <> NEW.user_id
    ),
    admin_manager_recipients AS (
      SELECT DISTINCT ur.user_id AS profile_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::public.app_role, 'manager'::public.app_role)
        AND ur.user_id <> NEW.user_id
    )
    SELECT DISTINCT profile_id
    FROM (
      SELECT profile_id FROM leader_recipients
      UNION
      SELECT profile_id FROM admin_manager_recipients
    ) recipients
    WHERE profile_id IS NOT NULL
  LOOP
    v_dedupe_key := 'leave_request:' || NEW.id::text || ':recipient:' || v_target.profile_id::text;

    INSERT INTO public.notifications (
      target_profile_id,
      actor_profile_id,
      user_id,
      created_by,
      type,
      kind,
      scope,
      entity_type,
      entity_id,
      title,
      message,
      body,
      severity,
      is_read,
      metadata,
      target_scope,
      team_id
    )
    SELECT
      v_target.profile_id,
      NEW.user_id,
      v_target.profile_id,
      NEW.user_id,
      'leave_request_created',
      'leave_request_created',
      'team',
      'leave_request',
      NEW.id,
      'Có đơn xin nghỉ mới',
      v_requester_name || ' xin nghỉ từ ' || v_start_label || ' đến ' || v_end_label,
      v_requester_name || ' xin nghỉ từ ' || v_start_label || ' đến ' || v_end_label,
      'warning',
      false,
      jsonb_build_object(
        'leave_request_id', NEW.id,
        'requester_id', NEW.user_id,
        'team_id', v_team_id,
        'start_date', NEW.start_date,
        'end_date', NEW.end_date,
        'dedupe_key', v_dedupe_key
      ),
      'team',
      v_team_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.notifications existing
      WHERE existing.metadata ->> 'dedupe_key' = v_dedupe_key
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_leave_request_reviewed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dedupe_key text;
  v_type text;
  v_title text;
  v_message text;
BEGIN
  IF OLD.status = NEW.status OR NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  v_type := CASE WHEN NEW.status = 'approved' THEN 'leave_request_approved' ELSE 'leave_request_rejected' END;
  v_title := CASE WHEN NEW.status = 'approved' THEN 'Đơn nghỉ đã được duyệt' ELSE 'Đơn nghỉ bị từ chối' END;
  v_message := COALESCE(
    NULLIF(NEW.review_note, ''),
    CASE
      WHEN NEW.status = 'approved' THEN 'Đơn xin nghỉ của bạn đã được duyệt.'
      ELSE 'Đơn xin nghỉ của bạn bị từ chối.'
    END
  );
  v_dedupe_key := 'leave_request:' || NEW.id::text || ':recipient:' || NEW.user_id::text || ':' || v_type;

  INSERT INTO public.notifications (
    target_profile_id,
    actor_profile_id,
    user_id,
    created_by,
    type,
    kind,
    scope,
    entity_type,
    entity_id,
    title,
    message,
    body,
    severity,
    is_read,
    metadata,
    target_scope,
    team_id
  )
  SELECT
    NEW.user_id,
    NEW.reviewed_by,
    NEW.user_id,
    NEW.reviewed_by,
    v_type,
    v_type,
    'personal',
    'leave_request',
    NEW.id,
    v_title,
    v_message,
    v_message,
    CASE WHEN NEW.status = 'approved' THEN 'success' ELSE 'error' END,
    false,
    jsonb_build_object(
      'leave_request_id', NEW.id,
      'requester_id', NEW.user_id,
      'status', NEW.status,
      'review_note', NEW.review_note,
      'dedupe_key', v_dedupe_key
    ),
    'personal',
    NULL
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.notifications existing
    WHERE existing.metadata ->> 'dedupe_key' = v_dedupe_key
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_leave_request_notify_created ON public.leave_requests;
CREATE TRIGGER tr_leave_request_notify_created
  AFTER INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_leave_request_created();

DROP TRIGGER IF EXISTS tr_leave_request_notify_reviewed ON public.leave_requests;
CREATE TRIGGER tr_leave_request_notify_reviewed
  AFTER UPDATE OF status ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_leave_request_reviewed();

NOTIFY pgrst, 'reload schema';
