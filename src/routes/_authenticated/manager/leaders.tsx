import { createFileRoute } from "@tanstack/react-router";
import { ManagerDirectoryWorkspace } from "@/components/workspace/ManagerDirectoryWorkspace";

export const Route = createFileRoute("/_authenticated/manager/leaders")({
  component: ManagerLeaders,
});

function ManagerLeaders() {
  return <ManagerDirectoryWorkspace mode="leaders" />;
}
