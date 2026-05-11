import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, type AppRole } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGuard,
});

function AuthGuard() {
  const { loading, session, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    if (!role) return;
    // Role-based path guarding
    const path = location.pathname;
    const allowed: Record<AppRole, string> = {
      admin: "/admin",
      marketing_manager: "/manager",
      leader: "/leader",
      employee: "/employee",
    };
    const home: Record<AppRole, string> = {
      admin: "/admin/dashboard",
      marketing_manager: "/manager/dashboard",
      leader: "/leader/dashboard",
      employee: "/employee/report",
    };
    if (!path.startsWith(allowed[role])) {
      navigate({ to: home[role] });
    }
  }, [loading, session, role, location.pathname, navigate]);

  if (loading || !session || !role) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
