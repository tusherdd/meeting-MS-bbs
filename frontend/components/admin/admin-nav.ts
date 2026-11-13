import { t } from "@/messages";

/** Admin pages, in menu order (sidebar sub-menu and the admin page tabs). */
export const ADMIN_LINKS = [
  { href: "/admin", label: t.admin.nav.overview },
  { href: "/admin/users", label: t.admin.nav.users },
  { href: "/admin/designations", label: t.admin.nav.designations },
  { href: "/admin/wings", label: t.admin.nav.wings },
  { href: "/admin/change-requests", label: t.admin.nav.changeRequests },
  { href: "/admin/meetings", label: t.admin.nav.meetings },
  { href: "/admin/conflicts", label: t.admin.nav.conflicts },
  { href: "/admin/reports", label: t.admin.nav.reports },
  { href: "/admin/email-outbox", label: t.admin.nav.emailOutbox },
  { href: "/admin/audit-logs", label: t.admin.nav.auditLogs },
] as const;

/** "/admin" is active only on itself; the others also on their sub-pages (/admin/users/123). */
export function isAdminLinkActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
