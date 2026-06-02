import { createFileRoute } from "@tanstack/react-router";

import { ProductsCatalogWorkspace } from "../admin/products";

export const Route = createFileRoute("/_authenticated/sale/products")({
  component: SaleProductsPage,
});

function SaleProductsPage() {
  return <ProductsCatalogWorkspace canManage={false} />;
}
