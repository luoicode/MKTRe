import { createFileRoute } from "@tanstack/react-router";
import { NotificationsWorkspace } from "@/components/workspace/NotificationsWorkspace";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  component: NotificationsWorkspace,
});
