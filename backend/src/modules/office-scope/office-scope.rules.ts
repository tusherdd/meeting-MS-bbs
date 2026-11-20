/**
 * Office report access (SPEC.md §6.10), pure rules (unit-tested in office-scope.rules.spec.ts).
 *
 * - ADMIN and SUPER_ADMIN always have OFFICE.
 * - Everyone else: the highest scope of their designation and of the DESIGNATIONS of their
 *   structured additional charges (v1.16; charges that still need review have none and count
 *   for nothing). The old guessing from the charge text (v1.15) is gone.
 * - WING viewers may see their own wing and (v1.16) the wing of every additional charge whose
 *   designation has WING scope.
 */
import { OfficeReportScope } from '../designations/enums/office-report-scope.enum';
import { UserRole } from '../users/enums/user-role.enum';

const RANK: Record<OfficeReportScope, number> = {
  [OfficeReportScope.NONE]: 0,
  [OfficeReportScope.WING]: 1,
  [OfficeReportScope.OFFICE]: 2,
};

export function maxScope(
  ...scopes: Array<OfficeReportScope | null | undefined>
): OfficeReportScope {
  let best = OfficeReportScope.NONE;
  for (const s of scopes) if (s && RANK[s] > RANK[best]) best = s;
  return best;
}

export function isAdminRole(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

/** One additional charge as the scope needs it: its designation's scope and its own wing. */
export interface ScopeCharge {
  /** null = no designation (needs review). */
  scope: OfficeReportScope | null;
  wingId: string | null;
}

export function resolveScope(input: {
  role: UserRole;
  designationScope: OfficeReportScope | null;
  charges: readonly ScopeCharge[];
}): OfficeReportScope {
  if (isAdminRole(input.role)) return OfficeReportScope.OFFICE;
  return maxScope(input.designationScope, ...input.charges.map((c) => c.scope));
}

/**
 * Wings a WING viewer may see, own wing first: their own wing and the wing of every additional
 * charge with WING scope (no duplicates). Empty → "no wing" (403 OFFICE_REPORT_NO_WING).
 */
export function scopeWingIds(
  ownWingId: string | null,
  charges: readonly ScopeCharge[],
): string[] {
  const ids = [
    ownWingId,
    ...charges
      .filter((c) => c.scope === OfficeReportScope.WING)
      .map((c) => c.wingId),
  ].filter((id): id is string => !!id);
  return [...new Set(ids)];
}
