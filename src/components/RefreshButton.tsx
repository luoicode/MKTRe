import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RefreshButton({
  isRefreshing,
  onRefresh,
  label = "Làm mới",
}: {
  isRefreshing: boolean;
  onRefresh: () => void | Promise<void>;
  label?: string;
}) {
  return (
    <Button type="button" variant="outline" onClick={onRefresh} disabled={isRefreshing}>
      <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
      {isRefreshing ? "Đang làm mới..." : label}
    </Button>
  );
}
