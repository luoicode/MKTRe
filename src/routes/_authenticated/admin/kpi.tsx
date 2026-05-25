import { createFileRoute } from "@tanstack/react-router";
import { KpiWorkspace } from "@/components/workspace/KpiWorkspace";
import { AdminMarketingSaleTabs, AdminSaleKpi } from "@/components/workspace/AdminSaleWorkspace";

export const Route = createFileRoute("/_authenticated/admin/kpi")({
  component: AdminKpi,
});

function AdminKpi() {
  return <AdminMarketingSaleTabs marketing={<KpiWorkspace />} sale={<AdminSaleKpi />} />;
}
