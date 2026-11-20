"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { decisionsApi, queryKeys } from "@/lib/endpoints";
import { useFormat, useT } from "@/providers/locale-provider";
import { useAuth } from "@/providers/auth-provider";
import { isActivePath, navFor } from "./nav-items";

/**
 * v1.11: number of Pending decisions of meetings I organize or chair; hidden when 0. Shared cache
 * with /decisions (refreshed with every meeting change).
 */
function DecisionCount() {
  const t = useT();
  const { formatNumber } = useFormat();
  const summary = useQuery({
    queryKey: queryKeys.decisionSummary,
    queryFn: decisionsApi.summary,
    staleTime: 60_000,
  });
  const pending = summary.data?.pending ?? 0;
  if (pending === 0) return null;
  return (
    <span
      className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs leading-5 font-semibold text-amber-900"
      data-testid="nav-decision-count"
    >
      <span aria-hidden="true">{formatNumber(pending)}</span>
      <span className="sr-only">{t.decisions.navCount(formatNumber(pending))}</span>
    </span>
  );
}

/** Menu links by role. Used in the desktop sidebar and in the mobile drawer. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const { isAdmin, user } = useAuth();

  return (
    <nav aria-label={t.nav.mainMenu}>
      <ul className="space-y-1">
        {navFor(isAdmin, t, user?.officeReportScope).map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={pathname === item.href ? "page" : undefined}
                className={clsx(
                  "block rounded-lg px-3 py-2.5 text-[15px] font-medium",
                  active
                    ? "bg-brand-100 font-semibold text-brand-900"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {item.label}
                {item.badge === "decisions" && <DecisionCount />}
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
