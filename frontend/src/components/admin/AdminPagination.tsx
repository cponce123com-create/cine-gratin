import { ChevronLeft, ChevronRight } from "lucide-react";

interface AdminPaginationProps {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  itemLabel?: string;
  /** Sizes offered in the selector (defaults to the usual table sizes). */
  pageSizes?: number[];
  /** Label of the size selector. */
  limitLabel?: string;
}

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Pagination controls for the administration tables.
 * The state lives on the server, so only the visible page is ever loaded.
 */
export default function AdminPagination({
  page,
  pages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  itemLabel = "elementos",
  pageSizes = PAGE_SIZES,
  limitLabel = "Por página",
}: AdminPaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  // A compact window of pages around the current one.
  const windowStart = Math.max(1, Math.min(page - 2, pages - 4));
  const windowEnd = Math.min(pages, windowStart + 4);
  const pageNumbers: number[] = [];
  for (let i = windowStart; i <= windowEnd; i++) pageNumbers.push(i);

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1"
    >
      <p className="text-xs text-gray-400" aria-live="polite">
        Mostrando <span className="text-gray-300 font-medium">{from}</span>–
        <span className="text-gray-300 font-medium">{to}</span> de{" "}
        <span className="text-gray-300 font-medium">{total}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-2">
        {onLimitChange && (
          <label className="flex items-center gap-1.5 text-xs text-gray-400">
            <span>{limitLabel}</span>
            <select
              value={limit}
              onChange={(event) => onLimitChange(Number(event.target.value))}
              aria-label={limitLabel}
              className="bg-brand-surface border border-brand-border rounded-md px-2 py-1 text-gray-300 text-xs focus-visible:ring-2 focus-visible:ring-brand-red"
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Página anterior"
            className="p-1.5 rounded-md border border-brand-border text-gray-400 hover:text-white hover:bg-brand-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-brand-red"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>

          {pageNumbers.map((number) => (
            <button
              key={number}
              type="button"
              onClick={() => onPageChange(number)}
              aria-current={number === page ? "page" : undefined}
              className={`min-w-8 h-8 px-2 rounded-md text-xs font-medium border transition-colors focus-visible:ring-2 focus-visible:ring-brand-red ${
                number === page
                  ? "bg-brand-red/20 text-white border-brand-red/40"
                  : "border-brand-border text-gray-400 hover:text-white hover:bg-brand-surface"
              }`}
            >
              {number}
            </button>
          ))}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pages}
            aria-label="Página siguiente"
            className="p-1.5 rounded-md border border-brand-border text-gray-400 hover:text-white hover:bg-brand-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-brand-red"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  );
}
