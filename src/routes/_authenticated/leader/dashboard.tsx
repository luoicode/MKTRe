import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export const Route = createFileRoute("/_authenticated/leader/dashboard")({
  component: LeaderDashboard,
});

function LeaderDashboard() {
  return <AnalyticsDashboard scope="leader" />;
}
