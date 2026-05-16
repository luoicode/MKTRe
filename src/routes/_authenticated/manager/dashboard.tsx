import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export const Route = createFileRoute("/_authenticated/manager/dashboard")({
  component: ManagerDashboard,
});

function ManagerDashboard() {
  return <AnalyticsDashboard scope="manager" />;
}
