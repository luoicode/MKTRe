import { createFileRoute } from "@tanstack/react-router";
import { SaleDashboardWorkspace } from "@/components/workspace/sale/SaleWorkspace";

export const Route = createFileRoute("/_authenticated/sale/dashboard")({
  component: SaleDashboardWorkspace,
});
