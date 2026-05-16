import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPresetRange,
  normalizeDateRange,
  type DatePreset,
  type DateRangeValue,
} from "@/lib/dateRange";

export function DateRangeFilter({
  value,
  onChange,
  className = "",
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  className?: string;
}) {
  const [preset, setPreset] = useState<DatePreset>(value.preset);
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);

  useEffect(() => {
    setPreset(value.preset);
    setFrom(value.from);
    setTo(value.to);
  }, [value.from, value.preset, value.to]);

  const changePreset = (nextPreset: DatePreset) => {
    setPreset(nextPreset);
    if (nextPreset === "custom") {
      onChange({ preset: nextPreset, from, to });
      return;
    }
    const nextRange = getPresetRange(nextPreset);
    setFrom(nextRange.from);
    setTo(nextRange.to);
    onChange({ preset: nextPreset, ...nextRange });
  };

  const changeFrom = (nextFrom: string) => {
    const normalized = normalizeDateRange({ preset: "custom", from: nextFrom, to });
    setFrom(nextFrom);
    if (normalized.to !== to) setTo(normalized.to);
    onChange(normalized);
  };

  const changeTo = (nextTo: string) => {
    const normalized = normalizeDateRange({ preset: "custom", from, to: nextTo });
    if (normalized.from !== from) setFrom(normalized.from);
    setTo(nextTo);
    onChange(normalized);
  };

  return (
    <div className={className || "flex flex-wrap items-end gap-2"}>
      <div className="min-w-36 space-y-1">
        <Label className="text-xs">Thời gian</Label>
        <Select value={preset} onValueChange={(next) => changePreset(next as DatePreset)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hôm nay</SelectItem>
            <SelectItem value="yesterday">Hôm qua</SelectItem>
            <SelectItem value="week">Tuần này</SelectItem>
            <SelectItem value="month">Tháng này</SelectItem>
            <SelectItem value="custom">Tùy chỉnh</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {preset === "custom" && (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Từ ngày</Label>
            <Input
              className="h-9"
              type="date"
              value={from}
              onChange={(e) => changeFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Đến ngày</Label>
            <Input
              className="h-9"
              type="date"
              value={to}
              onChange={(e) => changeTo(e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  );
}
