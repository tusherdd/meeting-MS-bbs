/**
 * The `?next=` target after login. Only same-site paths are allowed ("/meetings?x=1"),
 * never "//evil.com" or "https://…", so the login page cannot be used as an open redirect.
 */
export const DEFAULT_AFTER_LOGIN = "/dashboard";

export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  if (next.startsWith("/login") || next.startsWith("/change-password")) return DEFAULT_AFTER_LOGIN;
  return next;
}

export function loginUrlFor(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}
