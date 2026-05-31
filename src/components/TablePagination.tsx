import { Button } from "@/components/ui/button";

export function TablePagination({
  page,
  totalPages,
  onPageChange,
  className = "",
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div
      className={`flex items-center justify-end gap-3 border-t bg-white px-4 py-3 text-sm ${className}`}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        Trước
      </Button>
      <span className="min-w-24 text-center font-medium text-slate-600">
        Trang {page} / {totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        Sau
      </Button>
    </div>
  );
}
