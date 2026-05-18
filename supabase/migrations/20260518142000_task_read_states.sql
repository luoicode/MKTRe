CREATE TABLE IF NOT EXISTS public.task_read_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen_status text,
  seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_read_states_user_task
  ON public.task_read_states(user_id, task_id);

ALTER TABLE public.task_read_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_read_states_self_select ON public.task_read_states;
CREATE POLICY task_read_states_self_select
ON public.task_read_states
FOR SELECT
TO authenticated
USING (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS task_read_states_self_insert ON public.task_read_states;
CREATE POLICY task_read_states_self_insert
ON public.task_read_states
FOR INSERT
TO authenticated
WITH CHECK (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS task_read_states_self_update ON public.task_read_states;
CREATE POLICY task_read_states_self_update
ON public.task_read_states
FOR UPDATE
TO authenticated
USING (user_id = public.get_current_profile_id())
WITH CHECK (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS task_read_states_self_delete ON public.task_read_states;
CREATE POLICY task_read_states_self_delete
ON public.task_read_states
FOR DELETE
TO authenticated
USING (user_id = public.get_current_profile_id());

NOTIFY pgrst, 'reload schema';
