-- Latest/cumulative report rows must be chosen by the real submit/update time.
-- This ensures the 13h55 reconciliation submitted today for yesterday's report_date
-- wins over yesterday's 21h00 slot in ranking/report aggregations.

CREATE INDEX IF NOT EXISTS idx_slot_reports_user_date_recency
  ON public.slot_reports(user_id, report_date, submitted_at DESC, updated_at DESC, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_ranking_entries(
  p_from date DEFAULT CURRENT_DATE,
  p_to date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  id uuid,
  full_name text,
  username text,
  avatar_url text,
  role public.app_role,
  team_id uuid,
  team_name text,
  total_revenue numeric,
  streak_days integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT LEAST(p_from, p_to) AS from_date, GREATEST(p_from, p_to) AS to_date
  ),
  active_people AS (
    SELECT DISTINCT ON (p.id)
      p.id,
      COALESCE(NULLIF(p.full_name, ''), p.username, 'User')::text AS full_name,
      COALESCE(p.username, '')::text AS username,
      p.avatar_url::text AS avatar_url,
      ur.role,
      tm.team_id,
      COALESCE(t.name, 'Chưa có team')::text AS team_name
    FROM public.profiles p
    JOIN public.user_roles ur
      ON ur.user_id = p.id
     AND ur.role IN ('leader'::public.app_role, 'employee'::public.app_role)
    LEFT JOIN public.team_memberships tm
      ON tm.user_id = p.id
     AND tm.is_active = true
    LEFT JOIN public.teams t ON t.id = tm.team_id
    WHERE p.status = 'active'::public.user_status
    ORDER BY p.id, tm.created_at DESC
  ),
  latest_reports AS (
    SELECT DISTINCT ON (sr.user_id, sr.report_date)
      sr.user_id,
      sr.report_date,
      COALESCE(sr.total_revenue, 0)::numeric AS total_revenue
    FROM public.slot_reports sr
    JOIN bounds b ON sr.report_date BETWEEN b.from_date AND b.to_date
    LEFT JOIN public.report_slots rs ON rs.id = sr.slot_id
    WHERE sr.status IN ('submitted'::public.report_status, 'approved'::public.report_status)
    ORDER BY
      sr.user_id,
      sr.report_date,
      COALESCE(sr.submitted_at, sr.updated_at, sr.created_at) DESC,
      COALESCE(rs.sort_order, 0) DESC
  ),
  aggregated AS (
    SELECT
      lr.user_id,
      SUM(lr.total_revenue)::numeric AS total_revenue,
      COUNT(*) FILTER (WHERE lr.total_revenue > 0)::integer AS streak_days
    FROM latest_reports lr
    GROUP BY lr.user_id
  )
  SELECT
    ap.id,
    ap.full_name,
    ap.username,
    ap.avatar_url,
    ap.role,
    ap.team_id,
    ap.team_name,
    COALESCE(a.total_revenue, 0)::numeric AS total_revenue,
    COALESCE(a.streak_days, 0)::integer AS streak_days
  FROM active_people ap
  LEFT JOIN aggregated a ON a.user_id = ap.id
  ORDER BY COALESCE(a.total_revenue, 0) DESC, ap.full_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_ranking_entries(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
