import { createFileRoute } from "@tanstack/react-router";
import { AdsDashboardPage } from "../employee/ads-dashboard";

export const Route = createFileRoute("/_authenticated/leader/ads-dashboard")({
  component: AdsDashboardPage,
});
