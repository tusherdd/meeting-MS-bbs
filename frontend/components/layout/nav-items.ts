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

/** Admin submenu: placeholders for now (later frontend steps). */
export const ADMIN_NAV: NavItem = {
  href: "/admin",
  label: t.nav.admin,
  children: [
    { href: "/admin/users", label: t.nav.adminUsers },
    { href: "/admin/designations", label: t.nav.adminDesignations },
    { href: "/admin/change-requests", label: t.nav.adminChangeRequests },
    { href: "/admin/audit-logs", label: t.nav.adminAudit },
  ],
};

export function navFor(admin: boolean): NavItem[] {
  return admin ? [...OFFICER_NAV, ADMIN_NAV] : OFFICER_NAV;
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
