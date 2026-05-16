import { supabase } from "@/integrations/supabase/client";

export async function getReconciledReportIds(reportIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(reportIds.filter(Boolean) as string[]));
  if (!ids.length) return new Set<string>();

  const { data, error } = await supabase
    .from("report_audit_logs")
    .select("report_id")
    .in("report_id", ids)
    .eq("action_type", "reconciled");

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.report_id));
}

export function isReconciliationSlot(slotName: string) {
  return slotName.includes("13");
}
