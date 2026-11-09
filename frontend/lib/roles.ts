import type { Me, Role } from "./types";

type HasRole = Pick<Me, "role"> | null | undefined;

export function isSuperAdmin(user: HasRole): boolean {
  return user?.role === "SUPER_ADMIN";
}

/** ADMIN or SUPER_ADMIN (SPEC.md §5). */
export function isAdmin(user: HasRole): boolean {
  return user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
}

export function hasRole(user: HasRole, ...roles: Role[]): boolean {
  return !!user && roles.includes(user.role);
}
