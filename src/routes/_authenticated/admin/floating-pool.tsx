import { createFileRoute } from "@tanstack/react-router";
import { AdminFloatingLeadsCrmWorkspace } from "@/components/workspace/AdminFloatingLeadsCrmWorkspace";

export const Route = createFileRoute("/_authenticated/admin/floating-pool")({
  component: AdminFloatingLeadsCrmWorkspace,
});
