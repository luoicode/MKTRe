import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import {
  AdminMarketingSaleTabs,
  AdminSaleOverview,
} from "@/components/workspace/AdminSaleWorkspace";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  component: AdminDashboard,
});

function AdminDashboard() {
  return (
    <AdminMarketingSaleTabs
      marketing={<AnalyticsDashboard scope="admin" />}
      sale={<AdminSaleOverview />}
    />
  );
}
