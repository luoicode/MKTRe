import { createFileRoute } from "@tanstack/react-router";
import { LeaderSaleTeamWorkspace } from "@/components/workspace/sale/SaleWorkspace";

export const Route = createFileRoute("/_authenticated/sale/team")({
  component: LeaderSaleTeamWorkspace,
});
