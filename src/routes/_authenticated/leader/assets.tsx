import { createFileRoute } from "@tanstack/react-router";
import { AssetsWorkspace } from "@/components/workspace/AssetsWorkspace";

export const Route = createFileRoute("/_authenticated/leader/assets")({
  component: AssetsWorkspace,
});
