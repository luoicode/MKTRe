import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReportSlot {
  id: string;
  slot_name: string;
  slot_time: string;
  sort_order: number;
  is_active: boolean;
}

export function useSlots() {
  return useQuery({
    queryKey: ["report_slots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_slots")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as ReportSlot[];
    },
  });
}

export function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const vnd = new Intl.NumberFormat("vi-VN");

export const fmtVnd = (v: number | null | undefined) =>
  v == null ? "—" : vnd.format(Math.round(Number(v)));

/** Format VND with đ suffix, e.g. 1.000.000đ */
export const fmtVndDong = (v: number | null | undefined) =>
  v == null ? "—" : `${vnd.format(Math.round(Number(v)))}đ`;

/** v is a 0-1 ratio */
export const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${(Number(v) * 100).toFixed(2)}%`;

/** v is already a percentage value */
export const fmtPctValue = (v: number | null | undefined) =>
  v == null ? "—" : `${Number(v).toFixed(2)}%`;

export const fmtNum = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : Number(v).toFixed(digits);

/** Format integer (no decimals), Vietnamese grouping */
export const fmtInt = (v: number | null | undefined) =>
  v == null ? "—" : vnd.format(Math.round(Number(v)));

export function formatDateVN(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yy = dt.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

export function formatDateTimeVN(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const HH = String(dt.getHours()).padStart(2, "0");
  const MM = String(dt.getMinutes()).padStart(2, "0");
  const SS = String(dt.getSeconds()).padStart(2, "0");
  return `${HH}:${MM}:${SS} ${formatDateVN(dt)}`;
}

/**
 * Parse a VND money input. Treats dots/commas/spaces as thousand separators
 * (NEVER as decimal separators). Strips everything except digits.
 *  parseVndInput("6.098.261") = 6098261
 *  parseVndInput("6,098,261") = 6098261
 *  parseVndInput("6098261")   = 6098261
 *  parseVndInput("")          = 0
 */
export function parseVndInput(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const s = String(value).replace(/[^\d]/g, "");
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Format a positive integer VND amount with Vietnamese grouping + đ suffix. */
export const formatVnd = (v: number | null | undefined) =>
  v == null ? "—" : `${vnd.format(Math.max(0, Math.round(Number(v))))}đ`;

/** Format a money value that could be 0 or negative (no clamp). */
export const formatVndSigned = (v: number | null | undefined) =>
  v == null ? "—" : `${vnd.format(Math.round(Number(v)))}đ`;

/** Format a percent VALUE (e.g. 212.78 -> "212.78%"). */
export const formatPercent = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toFixed(digits)}%`;

/** Returns null if denominator is 0/negative/null. */
export function safeDivide(
  num: number | null | undefined,
  den: number | null | undefined,
): number | null {
  const n = Number(num),
    d = Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return n / d;
}

export interface RawReportNumbers {
  ads_cost: number;
  mess_count: number;
  data_count: number;
  closed_orders: number;
  daily_data_revenue: number;
  total_orders: number;
  total_revenue: number;
}

/**
 * Single source of truth for derived metrics across the system.
 *  cp_mess, cp_data, avg_order, recovered: VND amount (or null)
 *  conv_rate, cp_daily_pct, cp_total_pct: percent VALUE (e.g. 212.78), or null
 */
export function calculateReportMetrics(r: RawReportNumbers) {
  return {
    cp_mess: safeDivide(r.ads_cost, r.mess_count),
    cp_data: safeDivide(r.ads_cost, r.data_count),
    conv_rate: r.data_count > 0 ? (r.closed_orders / r.data_count) * 100 : null,
    avg_order: safeDivide(r.daily_data_revenue, r.closed_orders),
    cp_daily_pct: r.daily_data_revenue > 0 ? (r.ads_cost / r.daily_data_revenue) * 100 : null,
    cp_total_pct: r.total_revenue > 0 ? (r.ads_cost / r.total_revenue) * 100 : null,
    recovered: Number(r.total_revenue || 0) - Number(r.daily_data_revenue || 0),
  };
}

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
