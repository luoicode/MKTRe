CREATE TABLE IF NOT EXISTS public.contact_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_contact_notes_contact_created
ON public.contact_notes(contact_id, created_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contact_notes_created_by
ON public.contact_notes(created_by);

DROP TRIGGER IF EXISTS tr_contact_notes_updated ON public.contact_notes;
CREATE TRIGGER tr_contact_notes_updated
BEFORE UPDATE ON public.contact_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_notes_admin_manager_all ON public.contact_notes;
CREATE POLICY contact_notes_admin_manager_all
ON public.contact_notes
FOR ALL
TO authenticated
USING (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
)
WITH CHECK (
  public.has_role('admin'::public.app_role)
  OR public.has_role('manager'::public.app_role)
);

DROP POLICY IF EXISTS contact_notes_marketing_owner_select ON public.contact_notes;
CREATE POLICY contact_notes_marketing_owner_select
ON public.contact_notes
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.marketing_contacts contacts
    WHERE contacts.id = contact_notes.contact_id
      AND contacts.owner_user_id = public.get_current_profile_id()
  )
);

DROP POLICY IF EXISTS contact_notes_leader_team_select ON public.contact_notes;
CREATE POLICY contact_notes_leader_team_select
ON public.contact_notes
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND public.has_role('leader'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.marketing_contacts contacts
    JOIN public.team_memberships leader_membership
      ON leader_membership.team_id = contacts.team_id
     AND leader_membership.user_id = public.get_current_profile_id()
     AND leader_membership.role_in_team = 'leader'
     AND leader_membership.is_active = true
    WHERE contacts.id = contact_notes.contact_id
  )
);

DROP POLICY IF EXISTS contact_notes_sale_assignee_select ON public.contact_notes;
CREATE POLICY contact_notes_sale_assignee_select
ON public.contact_notes
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
  AND EXISTS (
    SELECT 1
    FROM public.marketing_contacts contacts
    WHERE contacts.id = contact_notes.contact_id
      AND contacts.raw_payload->>'sales_owner_profile_id' = public.get_current_profile_id()::text
  )
);

DROP POLICY IF EXISTS contact_notes_sale_assignee_insert ON public.contact_notes;
CREATE POLICY contact_notes_sale_assignee_insert
ON public.contact_notes
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = public.get_current_profile_id()
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
  AND EXISTS (
    SELECT 1
    FROM public.marketing_contacts contacts
    WHERE contacts.id = contact_notes.contact_id
      AND contacts.raw_payload->>'sales_owner_profile_id' = public.get_current_profile_id()::text
  )
);

DROP POLICY IF EXISTS contact_notes_sale_assignee_update ON public.contact_notes;
CREATE POLICY contact_notes_sale_assignee_update
ON public.contact_notes
FOR UPDATE
TO authenticated
USING (
  deleted_at IS NULL
  AND created_by = public.get_current_profile_id()
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
)
WITH CHECK (
  created_by = public.get_current_profile_id()
  AND (
    public.has_role('sale'::public.app_role)
    OR public.has_role('leader_sale'::public.app_role)
  )
);

INSERT INTO public.contact_notes (
  contact_id,
  content,
  created_by,
  created_by_name,
  created_at,
  updated_at
)
SELECT
  contacts.id,
  btrim(contacts.raw_payload->>'sale_note'),
  NULL,
  NULLIF(contacts.sales_owner_name, ''),
  COALESCE(contacts.updated_at, contacts.created_at, now()),
  COALESCE(contacts.updated_at, contacts.created_at, now())
FROM public.marketing_contacts contacts
WHERE NULLIF(btrim(contacts.raw_payload->>'sale_note'), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.contact_notes notes
    WHERE notes.contact_id = contacts.id
      AND notes.content = btrim(contacts.raw_payload->>'sale_note')
      AND notes.deleted_at IS NULL
  );

NOTIFY pgrst, 'reload schema';
