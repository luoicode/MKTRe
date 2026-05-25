import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { getRoleBasePath, getRoleHomePath } from "@/lib/roles";
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
    const sharedAuthenticatedPaths = ["/notifications"];
    if (sharedAuthenticatedPaths.some((sharedPath) => path === sharedPath)) return;
    if (!path.startsWith(getRoleBasePath(role))) {
      navigate({ to: getRoleHomePath(role) });
    }
  }, [loading, session, role, location.pathname, navigate]);

  if (loading || !session || !role) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
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
