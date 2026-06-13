-- Patch CRM V2 Marketing source metadata access for Sale contact detail.
-- customer_sources intentionally stores marketer_id/name only. Team/company are
-- resolved from profiles + team_memberships + teams, so Sale needs scoped read
-- access to the source marketer metadata for customers assigned to that Sale.

UPDATE public.profiles
SET
  company_name = COALESCE(NULLIF(btrim(company_name), ''), 'DASNOTRI-01'),
  updated_at = now()
WHERE NULLIF(btrim(company_name), '') IS NULL
  AND (
    full_name = 'Nguyễn Hữu Huy'
    OR full_name IN ('Quốc Việt', 'Nguyễn Quốc Việt', 'Tạ Quốc Việt', 'Đỗ Quốc Việt')
  );

DROP POLICY IF EXISTS profiles_sale_select_assigned_customer_marketers ON public.profiles;
CREATE POLICY profiles_sale_select_assigned_customer_marketers
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role('sale'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.customer_sources source
    JOIN public.customers customer
      ON customer.id = source.customer_id
    WHERE source.marketer_id = profiles.id
      AND customer.assigned_sale_id = public.get_current_profile_id()
  )
);

DROP POLICY IF EXISTS team_memberships_sale_select_assigned_customer_marketer_teams
ON public.team_memberships;
CREATE POLICY team_memberships_sale_select_assigned_customer_marketer_teams
ON public.team_memberships
FOR SELECT
TO authenticated
USING (
  public.has_role('sale'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.customer_sources source
    JOIN public.customers customer
      ON customer.id = source.customer_id
    WHERE source.marketer_id = team_memberships.user_id
      AND customer.assigned_sale_id = public.get_current_profile_id()
  )
);

DROP POLICY IF EXISTS teams_sale_select_assigned_customer_marketer_teams ON public.teams;
CREATE POLICY teams_sale_select_assigned_customer_marketer_teams
ON public.teams
FOR SELECT
TO authenticated
USING (
  public.has_role('sale'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.customer_sources source
    JOIN public.customers customer
      ON customer.id = source.customer_id
    JOIN public.team_memberships membership
      ON membership.user_id = source.marketer_id
     AND membership.team_id = teams.id
     AND membership.is_active = true
    WHERE customer.assigned_sale_id = public.get_current_profile_id()
  )
);

-- Verify after applying:
-- select
--   cs.customer_id,
--   cs.marketer_name,
--   p.employee_code,
--   p.company_name,
--   t.name as marketing_team_name,
--   cs.source_name,
--   cs.landing_url
-- from public.customer_sources cs
-- left join public.profiles p on p.id = cs.marketer_id
-- left join public.team_memberships tm on tm.user_id = p.id and tm.is_active = true
-- left join public.teams t on t.id = tm.team_id
-- where cs.source_name ilike '%NOTRIGOLD%'
-- order by cs.created_at desc;
