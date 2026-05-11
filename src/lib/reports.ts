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

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
