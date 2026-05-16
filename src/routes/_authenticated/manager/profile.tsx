import { createFileRoute } from "@tanstack/react-router";
import { ProfileWorkspace } from "@/components/workspace/ProfileWorkspace";

export const Route = createFileRoute("/_authenticated/manager/profile")({
  component: ProfileWorkspace,
});
