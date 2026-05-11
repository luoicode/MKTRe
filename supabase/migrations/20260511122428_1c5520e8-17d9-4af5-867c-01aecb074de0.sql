
-- ========== ENUMS ==========
CREATE TYPE public.app_role AS ENUM ('admin', 'leader', 'employee');
CREATE TYPE public.user_status AS ENUM ('active', 'inactive');
CREATE TYPE public.team_status AS ENUM ('active', 'inactive');
CREATE TYPE public.report_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'locked');
CREATE TYPE public.team_member_role AS ENUM ('leader', 'employee');
CREATE TYPE public.kpi_period AS ENUM ('day', 'week', 'month');

-- ========== PROFILES ==========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  status public.user_status NOT NULL DEFAULT 'active',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== USER_ROLES (separate table for security) ==========
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- ========== TEAMS ==========
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  leader_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status public.team_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== TEAM_MEMBERSHIPS ==========
CREATE TABLE public.team_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_in_team public.team_member_role NOT NULL DEFAULT 'employee',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_team_memberships_active ON public.team_memberships(team_id, user_id) WHERE is_active = true;

-- ========== REPORT_SLOTS ==========
CREATE TABLE public.report_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_name TEXT NOT NULL,
  slot_time TIME NOT NULL,
  sort_order INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.report_slots (slot_name, slot_time, sort_order) VALUES
  ('11h55', '11:55', 1),
  ('13h55', '13:55', 2),
  ('16h55', '16:55', 3),
  ('21h00', '21:00', 4);

-- ========== SLOT_REPORTS ==========
CREATE TABLE public.slot_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  report_date DATE NOT NULL,
  slot_id UUID NOT NULL REFERENCES public.report_slots(id),

  ads_cost NUMERIC NOT NULL DEFAULT 0,
  mess_count INTEGER NOT NULL DEFAULT 0,
  data_count INTEGER NOT NULL DEFAULT 0,
  closed_orders INTEGER NOT NULL DEFAULT 0,
  daily_data_revenue NUMERIC NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  note TEXT,

  -- Computed metrics
  cp_mess NUMERIC GENERATED ALWAYS AS (CASE WHEN mess_count > 0 THEN ads_cost / mess_count ELSE NULL END) STORED,
  cp_data NUMERIC GENERATED ALWAYS AS (CASE WHEN data_count > 0 THEN ads_cost / data_count ELSE NULL END) STORED,
  conversion_rate NUMERIC GENERATED ALWAYS AS (CASE WHEN data_count > 0 THEN closed_orders::NUMERIC / data_count ELSE NULL END) STORED,
  average_order_value NUMERIC GENERATED ALWAYS AS (CASE WHEN closed_orders > 0 THEN daily_data_revenue / closed_orders ELSE NULL END) STORED,
  cp_daily_revenue NUMERIC GENERATED ALWAYS AS (CASE WHEN daily_data_revenue > 0 THEN ads_cost / daily_data_revenue ELSE NULL END) STORED,
  cp_total_revenue NUMERIC GENERATED ALWAYS AS (CASE WHEN total_revenue > 0 THEN ads_cost / total_revenue ELSE NULL END) STORED,
  roas NUMERIC GENERATED ALWAYS AS (CASE WHEN ads_cost > 0 THEN total_revenue / ads_cost ELSE NULL END) STORED,
  recovered_revenue NUMERIC GENERATED ALWAYS AS (total_revenue - daily_data_revenue) STORED,

  status public.report_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id),
  rejected_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, report_date, slot_id)
);
CREATE INDEX idx_slot_reports_date ON public.slot_reports(report_date);
CREATE INDEX idx_slot_reports_team_date ON public.slot_reports(team_id, report_date);

-- ========== REPORT_COMMENTS ==========
CREATE TABLE public.report_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.slot_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== KPI_TARGETS ==========
CREATE TABLE public.kpi_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  period_type public.kpi_period NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  ads_target NUMERIC NOT NULL DEFAULT 0,
  mess_target INTEGER NOT NULL DEFAULT 0,
  data_target INTEGER NOT NULL DEFAULT 0,
  orders_target INTEGER NOT NULL DEFAULT 0,
  revenue_target NUMERIC NOT NULL DEFAULT 0,
  roas_target NUMERIC NOT NULL DEFAULT 0,
  conversion_rate_target NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== AUDIT_LOGS ==========
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ========== SECURITY DEFINER FUNCTIONS ==========
CREATE OR REPLACE FUNCTION public.get_current_profile_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid() AND ur.role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid() AND status = 'active'
  );
$$;

-- Returns team_ids that the current user leads (as team.leader_id)
CREATE OR REPLACE FUNCTION public.leads_team(_team_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.profiles p ON p.id = t.leader_id
    WHERE t.id = _team_id AND p.auth_user_id = auth.uid()
  );
$$;

-- Returns true if a profile is a member of a team led by the current user
CREATE OR REPLACE FUNCTION public.user_in_my_team(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    JOIN public.teams t ON t.id = tm.team_id
    JOIN public.profiles p ON p.id = t.leader_id
    WHERE tm.user_id = _user_id
      AND tm.is_active = true
      AND p.auth_user_id = auth.uid()
  );
$$;

-- ========== UPDATED_AT TRIGGER ==========
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER tr_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_teams_updated BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_memberships_updated BEFORE UPDATE ON public.team_memberships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_reports_updated BEFORE UPDATE ON public.slot_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tr_kpi_updated BEFORE UPDATE ON public.kpi_targets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========== ENABLE RLS ==========
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ========== RLS: PROFILES ==========
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "profiles_leader_select_team" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role('leader') AND public.user_in_my_team(id));

-- ========== RLS: USER_ROLES ==========
CREATE POLICY "user_roles_self_select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = public.get_current_profile_id());
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- ========== RLS: TEAMS ==========
CREATE POLICY "teams_admin_all" ON public.teams FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "teams_leader_select" ON public.teams FOR SELECT TO authenticated
  USING (public.leads_team(id));
CREATE POLICY "teams_employee_select_own" ON public.teams FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = teams.id
      AND tm.user_id = public.get_current_profile_id()
      AND tm.is_active = true
  ));

-- ========== RLS: TEAM_MEMBERSHIPS ==========
CREATE POLICY "tm_admin_all" ON public.team_memberships FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "tm_leader_select" ON public.team_memberships FOR SELECT TO authenticated
  USING (public.leads_team(team_id));
CREATE POLICY "tm_self_select" ON public.team_memberships FOR SELECT TO authenticated
  USING (user_id = public.get_current_profile_id());

-- ========== RLS: REPORT_SLOTS ==========
CREATE POLICY "slots_all_authenticated_select" ON public.report_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "slots_admin_write" ON public.report_slots FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- ========== RLS: SLOT_REPORTS ==========
CREATE POLICY "reports_admin_all" ON public.slot_reports FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "reports_self_select" ON public.slot_reports FOR SELECT TO authenticated
  USING (user_id = public.get_current_profile_id());
CREATE POLICY "reports_self_insert" ON public.slot_reports FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_profile_id() AND public.is_active_user());
CREATE POLICY "reports_self_update" ON public.slot_reports FOR UPDATE TO authenticated
  USING (user_id = public.get_current_profile_id() AND status IN ('draft', 'rejected'))
  WITH CHECK (user_id = public.get_current_profile_id());
CREATE POLICY "reports_leader_select_team" ON public.slot_reports FOR SELECT TO authenticated
  USING (public.has_role('leader') AND public.user_in_my_team(user_id));
CREATE POLICY "reports_leader_update_team" ON public.slot_reports FOR UPDATE TO authenticated
  USING (public.has_role('leader') AND public.user_in_my_team(user_id))
  WITH CHECK (public.has_role('leader') AND public.user_in_my_team(user_id));

-- ========== RLS: REPORT_COMMENTS ==========
CREATE POLICY "comments_admin_all" ON public.report_comments FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "comments_select_related" ON public.report_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.slot_reports sr
    WHERE sr.id = report_comments.report_id
      AND (
        sr.user_id = public.get_current_profile_id()
        OR (public.has_role('leader') AND public.user_in_my_team(sr.user_id))
      )
  ));
CREATE POLICY "comments_insert_related" ON public.report_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.get_current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.slot_reports sr
      WHERE sr.id = report_comments.report_id
        AND (
          sr.user_id = public.get_current_profile_id()
          OR (public.has_role('leader') AND public.user_in_my_team(sr.user_id))
        )
    )
  );

-- ========== RLS: KPI_TARGETS ==========
CREATE POLICY "kpi_admin_all" ON public.kpi_targets FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "kpi_self_select" ON public.kpi_targets FOR SELECT TO authenticated
  USING (user_id = public.get_current_profile_id());
CREATE POLICY "kpi_leader_select_team" ON public.kpi_targets FOR SELECT TO authenticated
  USING (public.has_role('leader') AND (public.leads_team(team_id) OR public.user_in_my_team(user_id)));

-- ========== RLS: AUDIT_LOGS ==========
CREATE POLICY "audit_admin_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role('admin'));
CREATE POLICY "audit_admin_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role('admin'));
