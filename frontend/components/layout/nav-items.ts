import { adminLinks } from "@/components/admin/admin-nav";
import type { Messages } from "@/messages";

export interface NavItem {
  href: string;
  label: string;
  /** v1.11: shows the Pending decision count next to the label. */
  badge?: "decisions";
  children?: { href: string; label: string }[];
}

/** Main menu in the UI language; admins also get the admin sub-menu. */
export function navFor(admin: boolean, t: Messages): NavItem[] {
  const officer: NavItem[] = [
    { href: "/dashboard", label: t.nav.dashboard },
    { href: "/meetings", label: t.nav.meetings },
    { href: "/conflicts", label: t.nav.conflicts },
    { href: "/decisions", label: t.nav.decisions, badge: "decisions" },
    { href: "/reports", label: t.nav.reports },
    { href: "/profile", label: t.nav.profile },
  ];
  if (!admin) return officer;
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
