/**
 * v1.15 office report access (SPEC.md §6.10), pure rules (unit-tested in office-scope.rules.spec.ts).
 *
 * - ADMIN and SUPER_ADMIN always have OFFICE.
 * - Everyone else: the highest scope of their designation and of the designations named by their
 *   additional charges (user_additional_charges).
 * - Additional charges are free text. A charge "is" a designation when its text starts with that
 *   designation's Bangla or English name as a whole word ("পরিচালক (বিকল্প), সেন্সাস উইং" → পরিচালক);
 *   the longest matching name wins, so "উপপরিচালক" is never read as "পরিচালক".
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

export interface ScopedDesignation {
  id: string;
  nameBn: string;
  nameEn: string;
  officeReportScope: OfficeReportScope;
}

/** After the name: the end, a space or punctuation — never another letter or a vowel sign. */
const BOUNDARY = /^($|[\s(),\-–—।:;/])/u;

function startsWithWord(text: string, name: string): boolean {
  const n = name.trim();
  if (!n || !text.startsWith(n)) return false;
  return BOUNDARY.test(text.slice(n.length));
}

/** The designation an additional charge names, or null ("এসডিজি সেল", "ফোকাল পয়েন্ট …" → null). */
export function chargeDesignation<T extends ScopedDesignation>(
  charge: string,
  designations: readonly T[],
): T | null {
  const text = charge.trim();
  const lower = text.toLowerCase();
  let best: { d: T; length: number } | null = null;
  for (const d of designations) {
    for (const [hay, name] of [
      [text, d.nameBn],
      [lower, d.nameEn.toLowerCase()],
    ] as const) {
      if (startsWithWord(hay, name) && (!best || name.length > best.length)) {
        best = { d, length: name.length };
      }
    }
  }
  return best?.d ?? null;
}

export function isAdminRole(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

export function resolveScope(input: {
  role: UserRole;
  designationScope: OfficeReportScope | null;
  charges: readonly string[];
  designations: readonly ScopedDesignation[];
}): OfficeReportScope {
  if (isAdminRole(input.role)) return OfficeReportScope.OFFICE;
  return maxScope(
    input.designationScope,
    ...input.charges.map(
      (c) => chargeDesignation(c, input.designations)?.officeReportScope,
    ),
  );
}
