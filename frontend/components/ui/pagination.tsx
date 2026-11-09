import { formatNumber } from "@/lib/format";
import { t } from "@/messages";
import { Button } from "./button";

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label={t.pagination.page(formatNumber(page), formatNumber(totalPages))}
      className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3"
    >
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t.pagination.prev}
      </Button>
      <span className="text-sm text-slate-600">
        {t.pagination.page(formatNumber(page), formatNumber(totalPages))}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        {t.pagination.next}
      </Button>
    </nav>
  );
}
