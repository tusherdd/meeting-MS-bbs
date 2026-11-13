"use client";

import clsx from "clsx";
import Link from "next/link";
import { notFound, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { t } from "@/messages";
import { useAuth } from "@/providers/auth-provider";
import { ADMIN_LINKS, isAdminLinkActive } from "./admin-nav";

/**
 * Every /admin page: officers get the normal 404 page (the admin area does not "exist" for
 * them); admins get a text sub-menu above the page. The backend checks the role again.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  const pathname = usePathname();
  if (!isAdmin) notFound();

  return (
    <div className="space-y-6">
      <nav aria-label={t.admin.menuLabel} className="-mx-1 overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b border-slate-200 px-1">
          {ADMIN_LINKS.map((link) => {
            const active = isAdminLinkActive(pathname, link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "-mb-px block border-b-2 px-3 pb-2.5 text-sm font-medium whitespace-nowrap",
                    active
                      ? "border-brand-700 text-brand-800"
                      : "border-transparent text-slate-600 hover:text-slate-900",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </div>
  );
}
