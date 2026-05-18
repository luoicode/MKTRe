import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SSOption {
  value: string;
  label: string;
  sub?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Chọn...",
  emptyText = "Không có",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SSOption[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(s) || (o.sub ?? "").toLowerCase().includes(s),
    );
  }, [q, options]);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center border-b px-2">
          <Search className="h-4 w-4 opacity-50" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm kiếm..."
            className="border-0 focus-visible:ring-0 shadow-none h-9"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
          )}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
                setQ("");
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-left",
                o.value === value && "bg-accent",
              )}
            >
              <Check className={cn("h-4 w-4", o.value === value ? "opacity-100" : "opacity-0")} />
              <span className="flex-1 truncate">
                {o.label}
                {o.sub && <span className="ml-1 text-xs text-muted-foreground">{o.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SearchableMultiSelect({
  values,
  onChange,
  options,
  placeholder = "Chọn...",
  emptyText = "Không có",
  className,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  options: SSOption[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const set = new Set(values);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(s) || (o.sub ?? "").toLowerCase().includes(s),
    );
  }, [q, options]);
  const toggle = (v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(Array.from(next));
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", values.length === 0 && "text-muted-foreground")}>
            {values.length === 0 ? placeholder : `Đã chọn ${values.length}`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center border-b px-2">
          <Search className="h-4 w-4 opacity-50" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm kiếm..."
            className="border-0 focus-visible:ring-0 shadow-none h-9"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
          )}
          {filtered.map((o) => {
            const checked = set.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-left",
                  checked && "bg-accent",
                )}
              >
                <Check className={cn("h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                <span className="flex-1 truncate">
                  {o.label}
                  {o.sub && <span className="ml-1 text-xs text-muted-foreground">{o.sub}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {values.length > 0 && (
          <div className="border-t p-2 flex justify-between">
            <Button size="sm" variant="ghost" onClick={() => onChange([])}>
              Bỏ chọn
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              Xong
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
