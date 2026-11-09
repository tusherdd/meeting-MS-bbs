import { t } from "@/messages";

export type NavIcon =
  "dashboard" | "meetings" | "calendar" | "conflicts" | "reports" | "profile" | "admin";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  children?: { href: string; label: string }[];
}

export const OFFICER_NAV: NavItem[] = [
  { href: "/dashboard", label: t.nav.dashboard, icon: "dashboard" },
  { href: "/meetings", label: t.nav.meetings, icon: "meetings" },
  { href: "/calendar", label: t.nav.calendar, icon: "calendar" },
  { href: "/conflicts", label: t.nav.conflicts, icon: "conflicts" },
  { href: "/reports", label: t.nav.reports, icon: "reports" },
  { href: "/profile", label: t.nav.profile, icon: "profile" },
];

/** Admin submenu: placeholders for now (later frontend steps). */
export const ADMIN_NAV: NavItem = {
  href: "/admin",
  label: t.nav.admin,
  icon: "admin",
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
