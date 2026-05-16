import { createFileRoute } from "@tanstack/react-router";
import { RankingWorkspace } from "@/components/workspace/RankingWorkspace";

export const Route = createFileRoute("/_authenticated/employee/ranking")({
  component: RankingWorkspace,
});
