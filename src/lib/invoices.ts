import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { fetchProducts, formatVnd, type ProductRow } from "@/lib/products";

export type InvoiceProduct = ProductRow;

export type InvoiceRow = {
  id: string;
  invoice_code: string;
  invoice_date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  subtotal_amount: number;
  discount_amount: number;
  final_amount: number;
  invoice_image_url: string | null;
  notes: string | null;
};

export type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  product_id: string | null;
  product_name: string;
  combo_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  created_at: string;
};

export type InvoiceWithItems = InvoiceRow & {
  items: InvoiceItemRow[];
};

export type CreateInvoiceItemInput = {
  product_id: string;
  product_name: string;
  combo_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
};

export type CreateInvoiceInput = {
  invoice_date: string;
  created_by: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  subtotal_amount: number;
  discount_amount: number;
  final_amount: number;
  notes?: string | null;
  items: CreateInvoiceItemInput[];
};

type QueryError = { message: string };
type QueryManyResult<T> = { data: T[] | null; error: QueryError | null };
type QuerySingleResult<T> = { data: T | null; error: QueryError | null };

interface InvoicesQuery<T> extends PromiseLike<QueryManyResult<T>> {
  select(columns?: string): InvoicesQuery<T>;
  insert(payload: unknown): InvoicesQuery<T>;
  order(column: string, options?: { ascending?: boolean }): InvoicesQuery<T>;
  in(column: string, values: string[]): InvoicesQuery<T>;
  single(): Promise<QuerySingleResult<T>>;
}

interface SupabaseInvoicesClient {
  from(table: "invoices"): InvoicesQuery<InvoiceRow>;
  from(table: "invoice_items"): InvoicesQuery<InvoiceItemRow>;
}

const invoicesClient = supabase as unknown as SupabaseInvoicesClient;

export async function fetchInvoiceProducts() {
  const products = await fetchProducts();
  return products.filter((product) => product.is_active);
}

export async function createInvoice(input: CreateInvoiceInput) {
  const invoiceCode = buildInvoiceCode(input.invoice_date);
  const { data: invoice, error: invoiceError } = await invoicesClient
    .from("invoices")
    .insert({
      invoice_code: invoiceCode,
      invoice_date: input.invoice_date,
      created_by: input.created_by,
      customer_name: input.customer_name.trim(),
      customer_phone: input.customer_phone.trim(),
      customer_address: input.customer_address.trim(),
      subtotal_amount: input.subtotal_amount,
      discount_amount: input.discount_amount,
      final_amount: input.final_amount,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (invoiceError) throw new Error(invoiceError.message);
  if (!invoice) throw new Error("Không tạo được hoá đơn");

  const itemsPayload = input.items.map((item) => ({
    invoice_id: invoice.id,
    product_id: item.product_id,
    product_name: item.product_name,
    combo_name: item.combo_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    subtotal: item.subtotal,
    discount_amount: item.discount_amount,
    total_amount: item.total_amount,
  }));

  const { error: itemsError } = await invoicesClient.from("invoice_items").insert(itemsPayload);
  if (itemsError) throw new Error(itemsError.message);

  return invoice;
}

export async function fetchAdminInvoices(): Promise<InvoiceWithItems[]> {
  const { data: invoices, error: invoicesError } = await invoicesClient
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });
  if (invoicesError) throw new Error(invoicesError.message);

  const invoiceRows = (invoices ?? []).map(normalizeInvoice);
  if (invoiceRows.length === 0) return [];

  const { data: items, error: itemsError } = await invoicesClient
    .from("invoice_items")
    .select("*")
    .in(
      "invoice_id",
      invoiceRows.map((invoice) => invoice.id),
    );
  if (itemsError) throw new Error(itemsError.message);

  const itemsByInvoice = new Map<string, InvoiceItemRow[]>();
  (items ?? []).map(normalizeInvoiceItem).forEach((item) => {
    const list = itemsByInvoice.get(item.invoice_id) ?? [];
    list.push(item);
    itemsByInvoice.set(item.invoice_id, list);
  });

  return invoiceRows.map((invoice) => ({
    ...invoice,
    items: itemsByInvoice.get(invoice.id) ?? [],
  }));
}

export function exportInvoicesToExcel(invoices: InvoiceWithItems[], filename: string) {
  const rows = invoices.map((invoice) => ({
    "Mã hoá đơn": invoice.invoice_code,
    "Ngày tạo": formatDateTime(invoice.created_at),
    "Khách hàng": invoice.customer_name,
    "Số điện thoại": invoice.customer_phone,
    "Địa chỉ": invoice.customer_address,
    "Sản phẩm": summarizeInvoiceProducts(invoice),
    "Tổng tiền": invoice.final_amount,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 22 },
    { wch: 28 },
    { wch: 16 },
    { wch: 42 },
    { wch: 56 },
    { wch: 16 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Hoá đơn");
  XLSX.writeFile(workbook, filename);
}

export function summarizeInvoiceProducts(invoice: InvoiceWithItems) {
  return invoice.items.map((item) => item.combo_name || item.product_name).join(", ");
}

export function formatInvoiceMoney(value: number) {
  return `${formatVnd(value)}đ`;
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildInvoiceCode(invoiceDate: string) {
  const datePart = invoiceDate.replace(/-/g, "");
  const entropy = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `HD-${datePart}-${Date.now().toString().slice(-6)}${entropy}`;
}

function normalizeNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeInvoice(invoice: InvoiceRow): InvoiceRow {
  return {
    ...invoice,
    subtotal_amount: normalizeNumber(invoice.subtotal_amount),
    discount_amount: normalizeNumber(invoice.discount_amount),
    final_amount: normalizeNumber(invoice.final_amount),
  };
}

function normalizeInvoiceItem(item: InvoiceItemRow): InvoiceItemRow {
  return {
    ...item,
    quantity: normalizeNumber(item.quantity),
    unit_price: normalizeNumber(item.unit_price),
    subtotal: normalizeNumber(item.subtotal),
    discount_amount: normalizeNumber(item.discount_amount),
    total_amount: normalizeNumber(item.total_amount),
  };
}
