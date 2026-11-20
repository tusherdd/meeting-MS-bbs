import { adminLinks } from "@/components/admin/admin-nav";
import type { Messages } from "@/messages";

export interface NavItem {
  href: string;
  label: string;
  /** v1.11: shows the Pending decision count next to the label. */
  badge?: "decisions";
  children?: { href: string; label: string }[];
}

/** v1.15 office report: one page and one route for every viewer (SPEC.md §6.10). */
export const OFFICE_REPORT_PATH = "/office-report";

/**
 * Main menu in the UI language; admins also get the admin sub-menu (with "অফিস রিপোর্ট").
 * v1.15: officers whose office report scope is WING or OFFICE get "অফিস রিপোর্ট" as the LAST item,
 * below "প্রোফাইল"; NONE gets no item.
 */
export function navFor(
  admin: boolean,
  t: Messages,
  officeReportScope: "NONE" | "WING" | "OFFICE" = "NONE",
): NavItem[] {
  const officer: NavItem[] = [
    { href: "/dashboard", label: t.nav.dashboard },
    { href: "/meetings", label: t.nav.meetings },
    { href: "/conflicts", label: t.nav.conflicts },
    { href: "/decisions", label: t.nav.decisions, badge: "decisions" },
    { href: "/reports", label: t.nav.reports },
    { href: "/profile", label: t.nav.profile },
  ];
  if (!admin) {
    return officeReportScope === "NONE"
      ? officer
      : [...officer, { href: OFFICE_REPORT_PATH, label: t.nav.officeReport }];
  }
  return [
    ...officer,
    {
      href: "/admin",
      label: t.nav.admin,
      children: adminLinks(t).filter((l) => l.href !== "/admin"),
    },
  ];
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
