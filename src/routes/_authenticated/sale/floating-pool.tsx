import { createFileRoute } from "@tanstack/react-router";
import { SaleFloatingPoolWorkspace } from "@/components/workspace/sale/SaleWorkspace";

export const Route = createFileRoute("/_authenticated/sale/floating-pool")({
  component: SaleFloatingPoolWorkspace,
});
