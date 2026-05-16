import { createFileRoute } from "@tanstack/react-router";
import { ManagerRevenueWorkspace } from "@/components/workspace/ManagerRevenueWorkspace";

export const Route = createFileRoute("/_authenticated/manager/revenue")({
  component: ManagerRevenueWorkspace,
});
