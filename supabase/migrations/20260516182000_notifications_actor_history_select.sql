-- Admin/manager notification workspace needs sent-history rows by actor.
-- Bell remains target-based because client queries target_profile_id only.

DROP POLICY IF EXISTS "notifications_target_select" ON public.notifications;

CREATE POLICY "notifications_target_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    target_profile_id = public.get_current_profile_id()
    OR (
      actor_profile_id = public.get_current_profile_id()
      AND (
        public.has_role('admin'::public.app_role)
        OR public.has_role('manager'::public.app_role)
      )
    )
  );

NOTIFY pgrst, 'reload schema';
