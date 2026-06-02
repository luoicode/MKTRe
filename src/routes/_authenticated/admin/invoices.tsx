import { createFileRoute } from "@tanstack/react-router";

import { InvoiceWorkspace } from "@/components/workspace/InvoiceWorkspace";

export const Route = createFileRoute("/_authenticated/admin/invoices")({
  component: InvoiceWorkspace,
});
