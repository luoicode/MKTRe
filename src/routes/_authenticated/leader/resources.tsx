import { createFileRoute } from "@tanstack/react-router";
import { ResourcesWorkspace } from "@/components/workspace/ResourcesWorkspace";

export const Route = createFileRoute("/_authenticated/leader/resources")({
  component: ResourcesWorkspace,
});
