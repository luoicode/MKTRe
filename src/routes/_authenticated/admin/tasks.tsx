import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/tasks")({
  component: () => <Navigate to="/admin/dashboard" replace />,
});
