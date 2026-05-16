import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  component: AdminDashboard,
});

function AdminDashboard() {
  return <AnalyticsDashboard scope="admin" />;
}
