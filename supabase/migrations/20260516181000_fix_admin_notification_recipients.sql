-- Allow admin system announcements to target active non-admin users.
-- Keep legacy target_scope synced with the new scope column for compatibility.

CREATE OR REPLACE FUNCTION public.sync_notification_legacy_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.scope := COALESCE(NULLIF(NEW.scope, ''), 'personal');
  NEW.target_scope := CASE
    WHEN NEW.scope IN ('system', 'team', 'personal') THEN NEW.scope
    WHEN NEW.target_scope = 'all' THEN 'system'
    WHEN NEW.target_scope = 'user' THEN 'personal'
    WHEN NEW.target_scope = 'team' THEN 'team'
    ELSE 'personal'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_notification_legacy_scope ON public.notifications;
CREATE TRIGGER tr_sync_notification_legacy_scope
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_notification_legacy_scope();

CREATE OR REPLACE FUNCTION public.can_insert_target_notification(
  _target_profile_id uuid,
  _actor_profile_id uuid,
  _scope text,
  _team_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _target_profile_id IS NOT NULL
    AND _actor_profile_id = public.get_current_profile_id()
    AND EXISTS (
      SELECT 1
      FROM public.profiles target_profile
      WHERE target_profile.id = _target_profile_id
        AND target_profile.status = 'active'::public.user_status
    )
    AND (
      (
        _scope = 'system'
        AND public.has_role('admin'::public.app_role)
      )
      OR (
        _scope = 'personal'
        AND (
          _target_profile_id = public.get_current_profile_id()
          OR public.has_role('admin'::public.app_role)
          OR public.manager_leads_user(_target_profile_id)
          OR public.user_in_my_team(_target_profile_id)
        )
      )
      OR (
        _scope = 'team'
        AND _team_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.team_memberships tm
          WHERE tm.user_id = _target_profile_id
            AND tm.team_id = _team_id
            AND tm.is_active = true
        )
        AND (
          public.has_role('admin'::public.app_role)
          OR public.manager_leads_team(_team_id)
          OR public.leads_team(_team_id)
        )
      )
    );
$$;

NOTIFY pgrst, 'reload schema';
