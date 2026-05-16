import { createFileRoute } from "@tanstack/react-router";
import { ManagerDirectoryWorkspace } from "@/components/workspace/ManagerDirectoryWorkspace";

export const Route = createFileRoute("/_authenticated/manager/teams")({
  component: ManagerTeams,
});

function ManagerTeams() {
  return <ManagerDirectoryWorkspace mode="teams" />;
}
