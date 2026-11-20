"use client";

import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { peopleApi, queryKeys } from "@/lib/endpoints";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useNames, useT } from "@/providers/locale-provider";

/** At most this many officers are listed at once; typing narrows the list. */
const PICKER_LIMIT = 50;

/**
 * v1.15 office report "কর্মকর্তা" filter: a button that opens a searchable list (GET /users/directory,
 * officers of the chosen wing or everyone). The backend checks the scope again: a WING viewer can
 * only use officers of their own wing. Keyboard: Enter / Space / Arrow Down open it, the search
 * field gets focus, Arrow keys move between the options, Escape closes and returns focus.
 */
export function OfficerPicker({
  idPrefix,
  wingId,
  value,
  valueLabel,
  onChange,
}: {
  idPrefix: string;
  /** Only officers of this wing ("" = everyone). */
  wingId: string;
  /** Selected officer id ("" = all officers). */
  value: string;
  /** Name of the selected officer (from the report). */
  valueLabel: string | null;
  onChange: (officerId: string) => void;
}) {
  const t = useT();
  const names = useNames();
  const labelId = useId();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);

  const query = { wingId: wingId || undefined, q: q || undefined, page: 1, limit: PICKER_LIMIT };
  const list = useQuery({
    queryKey: queryKeys.directory(query),
    queryFn: ({ signal }) => peopleApi.directory(query, signal),
    enabled: open,
    staleTime: 60_000,
  });

  // Close on a click or tap outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const options = () =>
    Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("[data-option]") ?? []);

  function close(returnFocus: boolean) {
    setOpen(false);
    setSearch("");
    if (returnFocus) buttonRef.current?.focus();
  }

  function choose(id: string) {
    onChange(id);
    close(true);
  }

  function onPanelKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = options();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
    items[next]?.focus();
  }

  const optionClass = (selected: boolean) =>
    clsx(
      "block w-full rounded-md px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-brand-700",
      selected ? "bg-brand-50 font-semibold text-brand-900" : "text-slate-800 hover:bg-slate-100",
    );

  return (
    <div className="relative w-full sm:w-64">
      <div className="space-y-1.5">
        <span id={labelId} className="block text-sm font-medium text-slate-800">
          {t.officeReport.officer}
        </span>
        <button
          ref={buttonRef}
          id={`${idPrefix}-officer`}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-labelledby={`${labelId} ${idPrefix}-officer`}
          onClick={() => (open ? close(false) : setOpen(true))}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && !open) {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-(--color-input-border) bg-white px-3 text-left text-[15px] text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-700 sm:h-10"
          data-testid="officer-picker"
        >
          <span className="truncate">
            {value ? (valueLabel ?? "…") : t.officeReport.allOfficers}
          </span>
        </button>
      </div>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={labelId}
          onKeyDown={onPanelKey}
          className="absolute right-0 z-40 mt-1 w-full min-w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-md"
        >
          <Input
            id={`${idPrefix}-officer-search`}
            label={t.officeReport.officerSearch}
            type="search"
            autoFocus
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="mt-2 max-h-64 space-y-0.5 overflow-y-auto" aria-live="polite">
            <button
              type="button"
              data-option=""
              aria-pressed={value === ""}
              className={optionClass(value === "")}
              onClick={() => choose("")}
            >
              {t.officeReport.allOfficers}
            </button>
            {list.isPending ? (
              <p className="px-3 py-2 text-sm text-slate-600">{t.common.loading}</p>
            ) : list.data && list.data.items.length > 0 ? (
              list.data.items.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  data-option=""
                  aria-pressed={value === o.id}
                  className={optionClass(value === o.id)}
                  onClick={() => choose(o.id)}
                >
                  {names.pick(o.nameBn, o.nameEn)}
                  {o.designation && (
                    <span className="block text-xs text-slate-600">
                      {names.pick(o.designation.nameBn, o.designation.nameEn)}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-slate-600">{t.officeReport.officerNoMatch}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
