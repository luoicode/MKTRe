-- Allow the actor that creates/reviews leave-request notifications to read those
-- rows back so the client can dispatch Telegram delivery with notification_id.
-- Recipients still read only their own inbox through the existing target policy.

DROP POLICY IF EXISTS "notifications_leave_actor_select_for_telegram" ON public.notifications;

CREATE POLICY "notifications_leave_actor_select_for_telegram" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    COALESCE(type, kind) IN (
      'leave_request_created',
      'leave_request_approved',
      'leave_request_rejected'
    )
    AND (
      actor_profile_id = public.get_current_profile_id()
      OR created_by = public.get_current_profile_id()
    )
  );

NOTIFY pgrst, 'reload schema';
