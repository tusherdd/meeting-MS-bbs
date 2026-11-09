"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "@/messages";
import { useAuth } from "@/providers/auth-provider";
import { Brand } from "./brand";
import { NotificationBell } from "./notification-bell";
import { SidebarNav } from "./sidebar";
import { UserMenu } from "./user-menu";

/**
 * Header + sidebar. On large screens the sidebar is always visible; on phones and tablets it
 * opens as a drawer from the menu button (native <dialog>: focus stays inside, Escape closes).
 * While a password change is required only the header with logout is shown.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const restricted = !!user?.mustChangePassword;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = drawerRef.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t.app.skipToContent}
      </a>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-16 items-center gap-2 px-3 sm:px-5">
          {!restricted && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label={t.common.openMenu}
              aria-expanded={drawerOpen}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none">
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
          <Brand compact />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {!restricted && <NotificationBell />}
            <UserMenu minimal={restricted} />
          </div>
        </div>
      </header>

      <div className="flex">
        {!restricted && (
          <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-3 py-4 lg:block">
            <SidebarNav />
          </aside>
        )}
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>

      {!restricted && (
        <dialog
          ref={drawerRef}
          onClose={() => setDrawerOpen(false)}
          onClick={(e) => {
            if (e.target === drawerRef.current) setDrawerOpen(false);
          }}
          aria-label={t.common.menu}
          className="m-0 h-full max-h-none w-72 max-w-[85vw] bg-white p-0 shadow-xl backdrop:bg-slate-900/40 lg:hidden"
        >
          <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
            <Brand compact />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              aria-label={t.common.closeMenu}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
                <path
                  d="M6 6l12 12M18 6 6 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="px-3 py-4">
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
          </div>
        </dialog>
      )}
    </div>
  );
}
