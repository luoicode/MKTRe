import { fetchProducts, type ProductRow } from "@/lib/products";

export type InvoiceProduct = ProductRow;

export async function fetchInvoiceProducts() {
  const products = await fetchProducts();
  return products.filter((product) => product.is_active);
}
