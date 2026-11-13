"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { t } from "@/messages";

/**
 * Native <dialog> as a modal: the browser traps focus, Escape closes it and focus returns to
 * the button that opened it.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          {t.common.close}
        </button>
      </div>
      {/* Content only while open: a closed dialog keeps no stale text, loading states or form data. */}
      {open && <div className="px-5 py-4">{children}</div>}
      {open && footer && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}
