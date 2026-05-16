import { createFileRoute } from "@tanstack/react-router";
import { ManagerReportsWorkspace } from "@/components/workspace/ManagerReportsWorkspace";

export const Route = createFileRoute("/_authenticated/manager/reports")({
  component: ManagerReportsWorkspace,
});
