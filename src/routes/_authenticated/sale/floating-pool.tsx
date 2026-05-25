import { createFileRoute } from "@tanstack/react-router";
import {
  LeaderSaleFloatingPoolWorkspace,
  SaleFloatingPoolWorkspace,
} from "@/components/workspace/sale/SaleWorkspace";
import { useAuth } from "@/lib/auth";
import { APP_ROLES } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/sale/floating-pool")({
  component: SaleFloatingPoolRoute,
});

function SaleFloatingPoolRoute() {
  const { role } = useAuth();
  return role === APP_ROLES.SALE_LEADER ? (
    <LeaderSaleFloatingPoolWorkspace />
  ) : (
    <SaleFloatingPoolWorkspace />
  );
}
