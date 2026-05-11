import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "marketing_manager" | "leader" | "employee";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  marketing_manager: "Trưởng Phòng Marketing",
  leader: "Leader Team",
  employee: "Nhân viên",
};

export interface Profile {
  id: string;
  auth_user_id: string;
  full_name: string;
  username: string;
  email: string;
  status: "active" | "inactive";
  avatar_url: string | null;
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

async function loadProfileAndRole(userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!profile) return { profile: null, role: null as AppRole | null };

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.id)
    .maybeSingle();

  return { profile: profile as Profile, role: (roleRow?.role as AppRole) ?? null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = async (s: Session | null) => {
    if (!s?.user) {
      setProfile(null);
      setRole(null);
      return;
    }
    const { profile: p, role: r } = await loadProfileAndRole(s.user.id);
    if (p && p.status === "inactive") {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      setRole(null);
      return;
    }
    setProfile(p);
    setRole(r);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      // Defer DB call to avoid deadlock
      setTimeout(() => void hydrate(s), 0);
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await hydrate(data.session);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setRole(null);
  };

  const refresh = async () => {
    const { data } = await supabase.auth.getSession();
    await hydrate(data.session);
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, profile, role, loading, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
