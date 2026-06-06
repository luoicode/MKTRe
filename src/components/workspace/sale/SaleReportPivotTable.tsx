import { Fragment } from "react";
import { Columns2, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getSaleReportOldCustomerCallCount,
  summarizeSaleReports,
  type SaleReportRow,
} from "@/lib/saleReports";
import {
  formatSaleInteger,
  formatSalePercent,
  formatSaleVnd,
  saleReportSlots,
} from "@/lib/saleReportUtils";
import { cn } from "@/lib/utils";

type SaleReportPivotTableProps = {
  reports: SaleReportRow[];
  getSaleName: (row: SaleReportRow) => string;
  formatDate: (value: string) => string;
  emptyMessage?: string;
};

export type SaleReportViewMode = "horizontal" | "vertical";

type PivotRow = {
  group: string;
  label: string;
  getValue: (row: SaleReportRow) => string;
  tone?: "result";
};

const pivotRows: PivotRow[] = [
  {
    group: "Thông tin chung",
    label: "Ngày",
    getValue: (row) => row.report_date,
  },
  {
    group: "Thông tin chung",
    label: "Khung giờ",
    getValue: (row) =>
      saleReportSlots.find((slot) => slot.id === row.slot_key)?.time ?? row.slot_time,
  },
  {
    group: "Data",
    label: "Data mới nhận",
    getValue: (row) => formatSaleInteger(row.new_data_received),
  },
  {
    group: "Data",
    label: "Data mới chốt",
    getValue: (row) => formatSaleInteger(row.new_data_closed),
  },
  {
    group: "Data",
    label: "Data mới tiếp cận",
    getValue: (row) => formatSaleInteger(Number(row.new_data_reach_count ?? 0)),
  },
  {
    group: "Data",
    label: "Data mới kết bạn ZL",
    getValue: (row) => formatSaleInteger(Number(row.new_data_zalo_friend_count ?? 0)),
  },
  {
    group: "Data",
    label: "Data thả nhận",
    getValue: (row) => formatSaleInteger(row.floating_data_received),
  },
  {
    group: "Data",
    label: "Data thả chốt",
    getValue: (row) => formatSaleInteger(row.floating_data_closed),
  },
  {
    group: "DS & Khách hàng",
    label: "DS khách mới",
    getValue: (row) => formatSaleVnd(Number(row.new_customer_revenue ?? 0)),
  },
  {
    group: "DS & Khách hàng",
    label: "Số data khách gọi video",
    getValue: (row) => formatSaleInteger(Number(row.video_call_data_count ?? 0)),
  },
  {
    group: "DS & Khách hàng",
    label: "DS thả nổi",
    getValue: (row) => formatSaleVnd(Number(row.floating_revenue ?? 0)),
  },
  {
    group: "DS & Khách hàng",
    label: "Số data khách cũ gọi",
    getValue: (row) => formatSaleInteger(getSaleReportOldCustomerCallCount(row)),
  },
  {
    group: "Kết quả",
    label: "Tổng DS",
    getValue: (row) => formatSaleVnd(summarizeSaleReports([row]).totalRevenue),
    tone: "result",
  },
  {
    group: "Kết quả",
    label: "Tỷ lệ chốt",
    getValue: (row) => formatSalePercent(summarizeSaleReports([row]).closeRate),
    tone: "result",
  },
  {
    group: "Kết quả",
    label: "TB đơn",
    getValue: (row) => {
      const summary = summarizeSaleReports([row]);
      return summary.averageOrder === null ? "—" : formatSaleVnd(summary.averageOrder);
    },
    tone: "result",
  },
];

export function SaleReportPivotTable({
  reports,
  getSaleName,
  formatDate,
  emptyMessage = "Chưa có báo cáo phù hợp bộ lọc.",
}: SaleReportPivotTableProps) {
  if (!reports.length) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
    );
  }

  const groupedRows = pivotRows.reduce<Array<{ group: string; rows: PivotRow[] }>>(
    (groups, row) => {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup?.group === row.group) {
        lastGroup.rows.push(row);
      } else {
        groups.push({ group: row.group, rows: [row] });
      }
      return groups;
    },
    [],
  );

  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[820px] table-fixed text-[13px]">
        <colgroup>
          <col className="w-44" />
          {reports.map((report, index) => (
            <col key={report.id} className={cn(index % 2 === 1 ? "bg-slate-50/80" : "bg-white")} />
          ))}
        </colgroup>
        <thead>
          <tr className="h-11 border-b bg-slate-100 text-xs text-slate-700">
            <th className="sticky left-0 z-20 bg-slate-100 px-3 text-left font-semibold">Chỉ số</th>
            {reports.map((report, index) => (
              <th
                key={report.id}
                className={cn(
                  "px-3 text-center font-semibold",
                  index % 2 === 1 ? "bg-slate-50" : "bg-white",
                )}
              >
                <span className="block truncate" title={getSaleName(report)}>
                  {getSaleName(report)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupedRows.map((group) => (
            <Fragment key={group.group}>
              <tr
                className={cn(
                  "h-8 border-b",
                  group.group === "Kết quả" ? "bg-emerald-50" : "bg-blue-50",
                )}
              >
                <td
                  className={cn(
                    "sticky left-0 z-10 px-3 text-left text-[11px] font-bold uppercase text-blue-700",
                    group.group === "Kết quả" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50",
                  )}
                >
                  {group.group}
                </td>
                {reports.map((report, index) => (
                  <td
                    key={`${group.group}-${report.id}`}
                    className={cn(
                      "px-3",
                      group.group === "Kết quả"
                        ? index % 2 === 1
                          ? "bg-emerald-50/70"
                          : "bg-emerald-50"
                        : index % 2 === 1
                          ? "bg-blue-50/70"
                          : "bg-blue-50",
                    )}
                  />
                ))}
              </tr>
              {group.rows.map((row) => (
                <tr key={`${group.group}-${row.label}`} className="h-9 border-b">
                  <td className="sticky left-0 z-10 bg-slate-50 px-3 text-left font-medium text-slate-700">
                    {row.label}
                  </td>
                  {reports.map((report, index) => {
                    const value =
                      row.label === "Ngày" ? formatDate(report.report_date) : row.getValue(report);
                    return (
                      <td
                        key={`${row.label}-${report.id}`}
                        className={cn(
                          "px-3 text-center align-middle",
                          index % 2 === 1 ? "bg-slate-50/80" : "bg-white",
                          row.tone === "result" &&
                            row.label === "Tổng DS" &&
                            "font-bold text-emerald-700",
                          row.tone === "result" &&
                            row.label === "Tỷ lệ chốt" &&
                            "font-semibold text-blue-700",
                        )}
                      >
                        {row.label === "Tỷ lệ chốt" ? (
                          <span className="inline-flex min-w-12 justify-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            {value}
                          </span>
                        ) : (
                          value
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SaleReportViewModeToggle({
  value,
  onChange,
}: {
  value: SaleReportViewMode;
  onChange: (value: SaleReportViewMode) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 self-end rounded-xl border bg-white p-1 shadow-sm">
      <Button
        type="button"
        variant={value === "horizontal" ? "default" : "ghost"}
        size="icon"
        className="h-9 w-9 rounded-lg"
        title="Xem ngang"
        aria-label="Xem ngang"
        onClick={() => onChange("horizontal")}
      >
        <Rows3 className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={value === "vertical" ? "default" : "ghost"}
        size="icon"
        className="h-9 w-9 rounded-lg"
        title="Xem dọc"
        aria-label="Xem dọc"
        onClick={() => onChange("vertical")}
      >
        <Columns2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
