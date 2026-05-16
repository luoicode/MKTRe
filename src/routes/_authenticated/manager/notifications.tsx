import { createFileRoute } from "@tanstack/react-router";
import { NotificationsWorkspace } from "@/components/workspace/NotificationsWorkspace";

export const Route = createFileRoute("/_authenticated/manager/notifications")({
  component: NotificationsWorkspace,
});
