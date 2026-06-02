import { createFileRoute } from "@tanstack/react-router";

import { AdminInvoicesWorkspace } from "@/components/workspace/AdminInvoicesWorkspace";

export const Route = createFileRoute("/_authenticated/admin/invoices")({
  component: AdminInvoicesWorkspace,
});
