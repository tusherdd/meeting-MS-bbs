import { ADMIN_LINKS } from "@/components/admin/admin-nav";
import { t } from "@/messages";

export interface NavItem {
  href: string;
  label: string;
  children?: { href: string; label: string }[];
}

export const OFFICER_NAV: NavItem[] = [
  { href: "/dashboard", label: t.nav.dashboard },
  { href: "/meetings", label: t.nav.meetings },
  { href: "/calendar", label: t.nav.calendar },
  { href: "/conflicts", label: t.nav.conflicts },
  { href: "/reports", label: t.nav.reports },
  { href: "/profile", label: t.nav.profile },
];

/** Admin sub-menu (same pages as the tabs on top of every admin page). */
export const ADMIN_NAV: NavItem = {
  href: "/admin",
  label: t.nav.admin,
  children: ADMIN_LINKS.filter((l) => l.href !== "/admin").map((l) => ({ ...l })),
};

export function navFor(admin: boolean): NavItem[] {
  return admin ? [...OFFICER_NAV, ADMIN_NAV] : OFFICER_NAV;
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
