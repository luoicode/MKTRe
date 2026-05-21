import { supabase } from "@/integrations/supabase/client";

export type FacebookManagerSpend = {
  amount: number;
  hasData: boolean;
};

type FacebookSpendRow = {
  campaign_name: string;
  spend: number | string | null;
};

const EXCLUDED_CAMPAIGN_PATTERN = "phủ";

export async function fetchFacebookManagerSpend(
  from: string,
  to: string,
): Promise<FacebookManagerSpend> {
  const { data, error } = await supabase
    .from("facebook_ad_spend_campaign_daily")
    .select("campaign_name, spend")
    .gte("spend_date", from)
    .lte("spend_date", to)
    .not("campaign_name", "ilike", `%${EXCLUDED_CAMPAIGN_PATTERN}%`);

  if (error) {
    console.warn("[facebook-spend] unable to load campaign spend", {
      from,
      to,
      message: error.message,
    });
    return { amount: 0, hasData: false };
  }

  const rows = (data ?? []) as FacebookSpendRow[];
  const includedRows = rows.filter(
    (row) => !row.campaign_name.toLowerCase().includes(EXCLUDED_CAMPAIGN_PATTERN),
  );
  const amount = includedRows.reduce((total, row) => total + Number(row.spend ?? 0), 0);

  return {
    amount,
    hasData: includedRows.length > 0,
  };
}

export function formatFacebookManagerSpend(
  spend: FacebookManagerSpend | undefined,
  formatter: (value: number) => string,
) {
  if (!spend) return "Đang tải...";
  if (!spend.hasData) return "Chưa đồng bộ";
  return formatter(spend.amount);
}
