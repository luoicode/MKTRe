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

export const fmtVnd = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("vi-VN").format(Math.round(v));

export const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toFixed(2)}%`;

export const fmtNum = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : v.toFixed(digits);
