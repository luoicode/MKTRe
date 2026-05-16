import { createFileRoute } from "@tanstack/react-router";
import { NotificationsWorkspace } from "@/components/workspace/NotificationsWorkspace";

export const Route = createFileRoute("/_authenticated/leader/notifications")({
  component: NotificationsWorkspace,
});
