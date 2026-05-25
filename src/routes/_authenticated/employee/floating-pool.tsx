import { createFileRoute } from "@tanstack/react-router";
import { MarketingFloatingPoolWorkspace } from "@/components/workspace/MarketingFloatingPoolWorkspace";

export const Route = createFileRoute("/_authenticated/employee/floating-pool")({
  component: MarketingFloatingPoolWorkspace,
});
