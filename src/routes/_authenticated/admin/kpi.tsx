import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/kpi")({
  component: () => <Navigate to="/admin/dashboard" replace />,
});
