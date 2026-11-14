"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { profileApi, queryKeys } from "@/lib/endpoints";
import { useCallback, useRef, useState } from "react";
import { t } from "@/messages";
import { useAuth } from "@/providers/auth-provider";
import { PersonIcon } from "./header-icons";
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
  const photoPath = profile.data?.photoPath;
  const photo = photoPath ? `/uploads/${photoPath.replace(/^\/+/, "")}` : null;

  async function onLogout() {
    setLeaving(true);
    await logout();
  }

  return (
    <div ref={boxRef} className="relative">
      {/* Round profile icon: the photo when there is one, else the person icon. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={user.nameBn}
        title={user.nameBn}
        className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
        data-testid="user-menu-button"
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="size-full object-cover" />
        ) : (
          <PersonIcon />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-2.5" data-testid="user-menu-header">
            <p className="truncate text-sm font-medium">{user.nameBn}</p>
            <p className="truncate text-xs text-slate-600">{subtitle}</p>
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
            {!minimal && (
              <li>
                <Link
                  href="/change-password"
                  onClick={close}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {t.auth.changeTitle}
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
