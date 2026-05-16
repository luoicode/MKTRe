import { createFileRoute } from "@tanstack/react-router";
import { ManagerDirectoryWorkspace } from "@/components/workspace/ManagerDirectoryWorkspace";

export const Route = createFileRoute("/_authenticated/manager/employees")({
  component: ManagerEmployees,
});

function ManagerEmployees() {
  return <ManagerDirectoryWorkspace mode="employees" />;
}
