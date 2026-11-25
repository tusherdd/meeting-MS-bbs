import type { Messages } from "@/messages";

/** Admin pages, in menu order (sidebar sub-menu and the admin page tabs), in the UI language. */
export function adminLinks(t: Messages) {
  return [
    { href: "/admin", label: t.admin.nav.overview },
    { href: "/admin/users", label: t.admin.nav.users },
    { href: "/admin/designations", label: t.admin.nav.designations },
    { href: "/admin/wings", label: t.admin.nav.wings },
    { href: "/admin/change-requests", label: t.admin.nav.changeRequests },
    { href: "/admin/meetings", label: t.admin.nav.meetings },
    { href: "/admin/conflicts", label: t.admin.nav.conflicts },
    // v1.15: the one office report page for every viewer; /admin/reports redirects there.
    { href: "/office-report", label: t.admin.nav.reports },
    { href: "/admin/email-outbox", label: t.admin.nav.emailOutbox },
    { href: "/admin/audit-logs", label: t.admin.nav.auditLogs },
    // v1.21 part 2: app-wide settings (notice reading method).
    { href: "/admin/settings", label: t.admin.nav.settings },
  ];
}

/** "/admin" is active only on itself; the others also on their sub-pages (/admin/users/123). */
export function isAdminLinkActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
