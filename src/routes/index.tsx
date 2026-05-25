import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { getRoleHomePath } from "@/lib/roles";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { loading, session, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    if (role) navigate({ to: getRoleHomePath(role) });
    else navigate({ to: "/login" });
  }, [loading, session, role, navigate]);

  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
