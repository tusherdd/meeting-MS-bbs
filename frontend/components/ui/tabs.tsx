"use client";

import clsx from "clsx";
import { useId, type KeyboardEvent } from "react";

export interface TabItem<K extends string> {
  key: K;
  label: string;
}

/**
 * Accessible tab bar (arrow keys move between tabs). The panel is rendered by the caller with
 * `id={panelId(baseId)}`; pass the same `id` here.
 */
export function Tabs<K extends string>({
  id,
  items,
  value,
  onChange,
  label,
  className,
}: {
  id?: string;
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  className?: string;
}) {
  const autoId = useId();
  const base = id ?? autoId;

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = items.findIndex((item) => item.key === value);
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = items[(i + step + items.length) % items.length].key;
    onChange(next);
    document.getElementById(`${base}-tab-${next}`)?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={clsx("flex flex-wrap gap-1", className)}>
      {items.map((item) => (
        <button
          key={item.key}
          id={`${base}-tab-${item.key}`}
          type="button"
          role="tab"
          aria-selected={value === item.key}
          aria-controls={`${base}-panel`}
          tabIndex={value === item.key ? 0 : -1}
          onClick={() => onChange(item.key)}
          onKeyDown={onKey}
          className={clsx(
            "-mb-px border-b-2 px-3 pb-2.5 text-sm font-medium",
            value === item.key
              ? "border-brand-700 text-brand-800"
              : "border-transparent text-slate-600 hover:text-slate-900",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function tabPanelProps(base: string, active: string) {
  return { id: `${base}-panel`, role: "tabpanel", "aria-labelledby": `${base}-tab-${active}` };
}
