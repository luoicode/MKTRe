import { createFileRoute } from "@tanstack/react-router";
import { KpiWorkspace } from "@/components/workspace/KpiWorkspace";

export const Route = createFileRoute("/_authenticated/manager/kpi")({ component: KpiWorkspace });
