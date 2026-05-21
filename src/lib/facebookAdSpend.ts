import { supabase } from "@/integrations/supabase/client";

export type FacebookManagerSpend = {
  amount: number;
  hasData: boolean;
};

type FacebookSpendRow = {
  campaign_name: string;
  spend: number | string | null;
};

const MKTRE_FACEBOOK_AD_ACCOUNT_ID = "act_2407288503067302";

export async function fetchFacebookManagerSpend(
  from: string,
  to: string,
): Promise<FacebookManagerSpend> {
  const { data, error } = await supabase
    .from("facebook_ad_spend_campaign_daily")
    .select("campaign_name, spend")
    .eq("ad_account_id", MKTRE_FACEBOOK_AD_ACCOUNT_ID)
    .gte("spend_date", from)
    .lte("spend_date", to)
    .not("campaign_name", "ilike", "%phủ%")
    .not("campaign_name", "ilike", "%phu%");

  if (error) {
    console.warn("[facebook-spend] unable to load campaign spend", {
      from,
      to,
      message: error.message,
    });
    return { amount: 0, hasData: false };
  }

  const rows = (data ?? []) as FacebookSpendRow[];
  const includedRows = rows.filter((row) => !isCoverageCampaign(row.campaign_name));
  const amount = includedRows.reduce((total, row) => total + Number(row.spend ?? 0), 0);

  return {
    amount,
    hasData: includedRows.length > 0,
  };
}

function isCoverageCampaign(campaignName: string) {
  const normalized = campaignName
    .trim()
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
  return normalized.includes("phu");
}

export function formatFacebookManagerSpend(
  spend: FacebookManagerSpend | undefined,
  formatter: (value: number) => string,
) {
  if (!spend) return "Đang tải...";
  if (!spend.hasData) return "Chưa đồng bộ";
  return formatter(spend.amount);
}
