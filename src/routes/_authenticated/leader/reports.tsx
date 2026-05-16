import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/leader/reports")({
  component: () => <Navigate to="/leader/daily-report" replace />,
});
