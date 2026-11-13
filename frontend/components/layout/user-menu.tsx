"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { profileApi, queryKeys } from "@/lib/endpoints";
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
  // The photo comes from GET /profile (shared cache with the profile page; /auth/me has no photo).
  const profile = useQuery({
    queryKey: queryKeys.profile,
    queryFn: profileApi.get,
    enabled: !!user && !minimal,
    staleTime: 5 * 60_000,
  });

  if (!user) return null;
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
        className="flex max-w-[12rem] items-center gap-2 rounded-lg border border-slate-300 px-2 py-1 text-sm font-medium text-slate-800 hover:bg-slate-100 sm:max-w-[16rem]"
        data-testid="user-menu-button"
      >
        <Avatar photoPath={profile.data?.photoPath} size="sm" />
        <span className="truncate px-1">{user.nameBn}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-2.5">
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
