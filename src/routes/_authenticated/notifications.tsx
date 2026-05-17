import { createFileRoute } from "@tanstack/react-router";
import { NotificationsWorkspace } from "@/components/workspace/NotificationsWorkspace";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: () => <NotificationsWorkspace mode="inbox" />,
});
