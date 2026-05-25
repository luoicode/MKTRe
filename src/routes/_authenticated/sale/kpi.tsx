import { createFileRoute } from "@tanstack/react-router";
import { SaleKpiWorkspace } from "@/components/workspace/sale/SaleWorkspace";

export const Route = createFileRoute("/_authenticated/sale/kpi")({
  component: SaleKpiWorkspace,
});
