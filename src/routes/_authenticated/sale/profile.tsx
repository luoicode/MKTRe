import { createFileRoute } from "@tanstack/react-router";
import { SaleInfoPage } from "@/components/workspace/sale/SaleInfoPage";

export const Route = createFileRoute("/_authenticated/sale/profile")({
  component: SaleInfoPage,
});
