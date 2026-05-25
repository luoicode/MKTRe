import { createFileRoute } from "@tanstack/react-router";
import { LeaderFloatingPoolWorkspace } from "@/components/workspace/LeaderFloatingPoolWorkspace";

export const Route = createFileRoute("/_authenticated/leader/floating-pool")({
  component: LeaderFloatingPoolWorkspace,
});
