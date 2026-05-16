import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export const Route = createFileRoute("/_authenticated/employee/dashboard")({
  component: EmployeeDashboard,
});

function EmployeeDashboard() {
  return <AnalyticsDashboard scope="employee" />;
}
