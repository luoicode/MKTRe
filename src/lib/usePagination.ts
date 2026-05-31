import { useEffect, useMemo, useState } from "react";

export const DEFAULT_TABLE_PAGE_SIZE = 10;

export function getEmptyRowsCount(currentPageRows: number, pageSize = DEFAULT_TABLE_PAGE_SIZE) {
  if (currentPageRows <= 0) return 0;
  return Math.max(0, pageSize - currentPageRows);
}

export function usePagination<T>({
  items,
  pageSize = DEFAULT_TABLE_PAGE_SIZE,
  resetKey,
}: {
  items: T[];
  pageSize?: number;
  resetKey?: unknown;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return {
    page,
    pageSize,
    totalPages,
    paginatedItems,
    emptyRowsCount: getEmptyRowsCount(paginatedItems.length, pageSize),
    setPage,
    hasPagination: totalPages > 1,
  };
}
