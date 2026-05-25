import { createFileRoute } from "@tanstack/react-router";
import { AdminFloatingLeadsWorkspace } from "@/components/workspace/AdminSaleWorkspace";

export const Route = createFileRoute("/_authenticated/admin/floating-pool")({
  component: AdminFloatingLeadsWorkspace,
});
