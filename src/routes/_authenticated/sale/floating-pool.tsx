import { createFileRoute } from "@tanstack/react-router";
import { SaleFloatingLeadsCrmWorkspace } from "@/components/workspace/SaleFloatingLeadsCrmWorkspace";

export const Route = createFileRoute("/_authenticated/sale/floating-pool")({
  component: SaleFloatingLeadsCrmWorkspace,
});
