import { supabase } from "@/integrations/supabase/client";

type QueryError = { message: string };
type QueryManyResult<T> = { data: T[] | null; error: QueryError | null };
type QuerySingleResult<T> = { data: T | null; error: QueryError | null };

interface ProductsQuery<T> extends PromiseLike<QueryManyResult<T>> {
  select(columns?: string): ProductsQuery<T>;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): ProductsQuery<T>;
  eq(column: string, value: unknown): ProductsQuery<T>;
  in(column: string, values: unknown[]): ProductsQuery<T>;
  insert(payload: ProductInsert | ProductInsert[]): ProductsQuery<T>;
  update(payload: ProductUpdate): ProductsQuery<T>;
  delete(): ProductsQuery<T>;
  single(): Promise<QuerySingleResult<T>>;
}

interface SupabaseProductsClient {
  from(table: "products"): ProductsQuery<ProductRow>;
}

export interface ProductRow {
  id: string;
  parent_id: string | null;
  name: string;
  product_group: string | null;
  quantity: number;
  unit: string;
  price_before_tax: number;
  base_price: number;
  discount_percent: number;
  price_after_discount: number;
  final_price_after_discount: number;
  gift: string | null;
  next_voucher: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductDraft {
  parent_id?: string | null;
  name: string;
  product_group?: string | null;
  quantity: number;
  unit: string;
  price_before_tax: number;
  base_price: number;
  discount_percent: number;
  gift?: string | null;
  next_voucher?: string | null;
  image_url?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

type ProductInsert = Omit<ProductDraft, "is_active"> & {
  price_after_discount: number;
  final_price_after_discount: number;
  is_active?: boolean;
};

type ProductUpdate = Partial<ProductInsert>;

const productsClient = supabase as unknown as SupabaseProductsClient;

function productsTable() {
  return productsClient.from("products");
}

function createProductImagePath(file: File, productName: string) {
  const slug =
    productName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "product";
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  return `products/${slug}-${Date.now()}.${extension}`;
}

function normalizeNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeProduct(row: ProductRow): ProductRow {
  return {
    ...row,
    quantity: normalizeNumber(row.quantity),
    price_before_tax: normalizeNumber(row.price_before_tax),
    base_price: normalizeNumber(row.base_price),
    discount_percent: normalizeNumber(row.discount_percent),
    price_after_discount: normalizeNumber(row.price_after_discount),
    final_price_after_discount: normalizeNumber(row.final_price_after_discount),
    sort_order: normalizeNumber(row.sort_order),
  };
}

export function calculateProductPrices(basePrice: number, discountPercent: number) {
  const priceAfterDiscount = Math.round(basePrice * (1 - discountPercent / 100));
  return {
    price_after_discount: priceAfterDiscount,
    final_price_after_discount: priceAfterDiscount,
  };
}

export function formatVnd(value: number | null | undefined) {
  return Math.round(value ?? 0).toLocaleString("vi-VN");
}

export function parseVndInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function toProductPayload(input: ProductDraft): ProductInsert {
  const prices = calculateProductPrices(input.base_price, input.discount_percent);
  return {
    parent_id: input.parent_id ?? null,
    name: input.name.trim(),
    product_group: input.product_group?.trim() || null,
    quantity: input.quantity,
    unit: input.unit.trim() || "hũ",
    price_before_tax: input.price_before_tax,
    base_price: input.base_price,
    discount_percent: input.discount_percent,
    price_after_discount: prices.price_after_discount,
    final_price_after_discount: prices.final_price_after_discount,
    gift: input.gift?.trim() || null,
    next_voucher: input.next_voucher?.trim() || null,
    image_url: input.image_url?.trim() || null,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active ?? true,
  };
}

export async function fetchProducts() {
  const { data, error } = await productsTable()
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizeProduct);
}

export async function createProduct(input: ProductDraft) {
  const { data, error } = await productsTable()
    .insert(toProductPayload(input))
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Không tạo được sản phẩm");
  return normalizeProduct(data);
}

export async function updateProduct(id: string, input: ProductDraft) {
  const { data, error } = await productsTable()
    .update(toProductPayload(input))
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Không cập nhật được sản phẩm");
  return normalizeProduct(data);
}

export async function deleteProduct(id: string) {
  const { error } = await productsTable().delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function toggleProductActive(id: string, isActive: boolean) {
  const { data, error } = await productsTable()
    .update({ is_active: isActive })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Không cập nhật trạng thái sản phẩm");
  return normalizeProduct(data);
}

export async function uploadProductImage(file: File, productName: string) {
  const path = createProductImagePath(file, productName);
  const { error } = await supabase.storage.from("product-images").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function updateProductsImage(productIds: string[], imageUrl: string) {
  if (productIds.length === 0) return;
  const { error } = await productsTable().update({ image_url: imageUrl }).in("id", productIds);
  if (error) throw new Error(error.message);
}
