import { createFileRoute } from "@tanstack/react-router";
import { SaleReportWorkspace } from "@/components/workspace/sale/SaleWorkspace";

export const Route = createFileRoute("/_authenticated/sale/report")({
  component: SaleReportWorkspace,
});
