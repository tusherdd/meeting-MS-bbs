"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/messages";
import { useAuth } from "@/providers/auth-provider";
import { isActivePath, navFor } from "./nav-items";

/** Menu links by role. Used in the desktop sidebar and in the mobile drawer. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  return (
    <nav aria-label={t.nav.mainMenu}>
      <ul className="space-y-1">
        {navFor(isAdmin).map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={pathname === item.href ? "page" : undefined}
                className={clsx(
                  "block rounded-lg px-3 py-2 text-[15px] font-medium",
                  active
                    ? "bg-brand-50 text-brand-800"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {item.label}
              </Link>
              {item.children && (
                <ul className="mt-1 ml-8 space-y-0.5 border-l border-slate-200 pl-3">
                  {item.children.map((child) => (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={pathname === child.href ? "page" : undefined}
                        className={clsx(
                          "block rounded-md px-2 py-1.5 text-sm",
                          isActivePath(pathname, child.href)
                            ? "font-medium text-brand-800"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                        )}
                      >
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
