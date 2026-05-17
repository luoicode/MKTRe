import { createFileRoute } from "@tanstack/react-router";
import { KpiWorkspace } from "@/components/workspace/KpiWorkspace";

export const Route = createFileRoute("/_authenticated/admin/kpi")({
  component: KpiWorkspace,
});
