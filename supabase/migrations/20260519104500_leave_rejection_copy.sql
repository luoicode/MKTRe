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
  v_title := CASE WHEN NEW.status = 'approved' THEN 'Đơn nghỉ đã được duyệt' ELSE 'Đơn nghỉ không được duyệt' END;
  v_message := COALESCE(
    NULLIF(NEW.review_note, ''),
    CASE
      WHEN NEW.status = 'approved' THEN 'Đơn xin nghỉ của bạn đã được duyệt.'
      ELSE 'Đơn xin nghỉ của bạn không được duyệt.'
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

DROP TRIGGER IF EXISTS tr_leave_request_notify_reviewed ON public.leave_requests;
CREATE TRIGGER tr_leave_request_notify_reviewed
  AFTER UPDATE OF status ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_leave_request_reviewed();

NOTIFY pgrst, 'reload schema';
