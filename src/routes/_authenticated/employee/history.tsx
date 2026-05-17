import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/employee/history")({
  component: () => <Navigate to="/employee/reports" replace />,
});
