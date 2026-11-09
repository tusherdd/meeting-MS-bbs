"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { t } from "@/messages";
import { useAuth } from "@/providers/auth-provider";
import { useDismiss } from "./use-dismiss";

export function UserMenu({ minimal = false }: { minimal?: boolean }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(boxRef, open, close, buttonRef);

  if (!user) return null;
  const initial = user.nameBn.trim().charAt(0) || "?";
  const subtitle = user.designation?.nameBn ?? t.roles[user.role];

  async function onLogout() {
    setLeaving(true);
    await logout();
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t.header.userMenu}
        className="flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 hover:bg-slate-100"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800"
        >
          {initial}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-48 truncate text-sm font-medium text-slate-900">
            {user.nameBn}
          </span>
          <span className="block max-w-48 truncate text-xs text-slate-500">{subtitle}</span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="size-4 text-slate-500"
          fill="currentColor"
        >
          <path d="M5.2 7.2a.75.75 0 0 1 1.06 0L10 10.94l3.74-3.74a.75.75 0 1 1 1.06 1.06l-4.27 4.27a.75.75 0 0 1-1.06 0L5.2 8.26a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-2.5 sm:hidden">
            <p className="truncate text-sm font-medium">{user.nameBn}</p>
            <p className="truncate text-xs text-slate-500">{subtitle}</p>
          </div>
          <p className="truncate px-4 pt-2 text-xs text-slate-500">{user.loginEmail}</p>
          <ul className="py-1">
            {!minimal && (
              <li>
                <Link
                  href="/profile"
                  onClick={close}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {t.nav.profile}
                </Link>
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={onLogout}
                disabled={leaving}
                className="block w-full px-4 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                {t.auth.logout}
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
