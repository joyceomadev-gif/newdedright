import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

export const PAGE_SIZE = 50;

export function usePagedSlice<T>(items: T[], page: number, setPage: (n: number) => void, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  // Clamp when the underlying list shrinks (filters, deletes).
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page, setPage]);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    totalPages,
    page: safePage,
    start,
    end: Math.min(items.length, start + pageSize),
  };
}

export function PaginationBar({
  page,
  totalPages,
  totalItems,
  start,
  end,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  start: number;
  end: number;
  onPageChange: (n: number) => void;
}) {
  if (totalItems === 0) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm text-muted-foreground pt-2">
      <div>
        Showing <span className="font-medium text-foreground">{start + 1}</span>
        –<span className="font-medium text-foreground">{end}</span> of{" "}
        <span className="font-medium text-foreground">{totalItems}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <span className="tabular-nums">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
