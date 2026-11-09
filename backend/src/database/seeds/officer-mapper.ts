/**
 * Pure mapping from CSV rows to officers to insert (no database access, so it is unit-tested).
 *
 * - Skip (reported, seed continues): no login_email, invalid email, duplicate email in the CSV,
 *   email reserved for the super admin.
 * - Fatal (SeedDataError, nothing is written): unknown designation or wing, missing name or
 *   designation, unknown/forbidden role, inconsistent wing names.
 * - Warning (value stored as NULL): phone/fax that is not a valid number, e.g. Excel scientific
 *   notation like "8.80255E+11" whose digits are lost.
 *
 * Reports identify rows only by "source_sl N" (or "row N" = file line) — never by personal data.
 */
import { UserRole } from '../../modules/users/enums/user-role.enum';
import type { OfficerCsvRow } from './officer-csv';
import type { WingSeed } from './seed-data';
import { SeedDataError } from './seed-errors';

export const CHARGES_SEPARATOR = ' | ';

export interface OfficerSeed {
  row: string;
  loginEmail: string;
  nameBn: string;
  nameEn: string;
  designationId: string;
  designationRemark: string | null;
  wingId: string | null;
  organizationBn: string | null;
  organizationEn: string | null;
  mobile: string | null;
  mobileAlt: string | null;
  officePhone: string | null;
  fax: string | null;
  role: UserRole;
  additionalCharges: string[];
}

export interface RowNote {
  row: string;
  reason: string;
}

export interface OfficerLookups {
  /** Keyed by lookupKey(nameEn). */
  designationIdByNameEn: ReadonlyMap<string, string>;
  /** Keyed by lookupKey(nameEn). */
  wingIdByNameEn: ReadonlyMap<string, string>;
  /** Lowercased emails that officers may not use (the super admin account). */
  reservedEmails: ReadonlySet<string>;
}

export interface OfficerMappingResult {
  officers: OfficerSeed[];
  skipped: RowNote[];
  warnings: RowNote[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Digits with optional leading +, spaces and dashes; at least 5 digits. */
const PHONE_PATTERN = /^\+?[0-9][0-9 -]{3,}[0-9]$/;
const CSV_ROLES: Readonly<Record<string, UserRole>> = {
  '': UserRole.OFFICER,
  OFFICER: UserRole.OFFICER,
  ADMIN: UserRole.ADMIN,
};

/** Case- and whitespace-insensitive key for matching names. */
export function lookupKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** "source_sl 12", or "row 2" (file line) when source_sl is blank. */
export function rowLabel(
  row: Pick<OfficerCsvRow, 'source_sl' | 'line'>,
): string {
  const sl = row.source_sl.trim();
  return sl ? `source_sl ${sl}` : `row ${row.line}`;
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed === '' ? null : trimmed;
}

/** Splits "A | B | A" into ["A", "B"] (trimmed, empty parts dropped, duplicates removed). */
export function splitCharges(value: string): string[] {
  const parts = value
    .split(CHARGES_SEPARATOR)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return [...new Set(parts)];
}

/**
 * Distinct wings named in the CSV. A row with no wing is allowed (wingId = NULL).
 * Throws when one English name has two Bangla names, or only one of the two is filled.
 */
export function collectCsvWings(rows: readonly OfficerCsvRow[]): WingSeed[] {
  const byKey = new Map<string, WingSeed & { firstRow: string }>();
  const problems: string[] = [];

  for (const row of rows) {
    const nameEn = textOrNull(row.wing_en);
    const nameBn = textOrNull(row.wing_bn);
    if (!nameEn && !nameBn) continue;
    if (!nameEn || !nameBn) {
      problems.push(
        `${rowLabel(row)}: wing_en and wing_bn must both be filled or both empty`,
      );
      continue;
    }
    const existing = byKey.get(lookupKey(nameEn));
    if (!existing) {
      byKey.set(lookupKey(nameEn), { nameEn, nameBn, firstRow: rowLabel(row) });
    } else if (existing.nameBn !== nameBn) {
      problems.push(
        `${rowLabel(row)}: wing "${nameEn}" has a different wing_bn than ${existing.firstRow}`,
      );
    }
  }

  if (problems.length > 0) throw new SeedDataError(problems);
  return [...byKey.values()].map(({ nameEn, nameBn }) => ({ nameEn, nameBn }));
}

export function mapOfficerRows(
  rows: readonly OfficerCsvRow[],
  lookups: OfficerLookups,
): OfficerMappingResult {
  const officers: OfficerSeed[] = [];
  const skipped: RowNote[] = [];
  const warnings: RowNote[] = [];
  const problems: string[] = [];
  const firstRowByEmail = new Map<string, string>();

  for (const row of rows) {
    const label = rowLabel(row);

    // --- skip rules -------------------------------------------------------------------
    const loginEmail = row.login_email.trim().toLowerCase();
    if (!loginEmail) {
      skipped.push({ row: label, reason: 'no login_email' });
      continue;
    }
    if (!EMAIL_PATTERN.test(loginEmail)) {
      skipped.push({ row: label, reason: 'invalid login_email format' });
      continue;
    }
    if (lookups.reservedEmails.has(loginEmail)) {
      skipped.push({
        row: label,
        reason: 'login_email is reserved for the super admin',
      });
      continue;
    }
    const firstRow = firstRowByEmail.get(loginEmail);
    if (firstRow) {
      skipped.push({
        row: label,
        reason: `duplicate login_email (same as ${firstRow})`,
      });
      continue;
    }
    firstRowByEmail.set(loginEmail, label);

    // --- fatal checks -----------------------------------------------------------------
    const nameBn = textOrNull(row.name_bn);
    const nameEn = textOrNull(row.name_en);
    if (!nameBn || !nameEn) {
      problems.push(`${label}: name_bn and name_en are required`);
    }

    const designationEn = textOrNull(row.designation_en);
    const designationId = designationEn
      ? lookups.designationIdByNameEn.get(lookupKey(designationEn))
      : undefined;
    if (!designationEn) {
      problems.push(`${label}: designation_en is required`);
    } else if (!designationId) {
      problems.push(
        `${label}: designation_en "${designationEn}" matches no designation`,
      );
    }

    const wingEn = textOrNull(row.wing_en);
    const wingId = wingEn
      ? lookups.wingIdByNameEn.get(lookupKey(wingEn))
      : null;
    if (wingEn && !wingId) {
      problems.push(`${label}: wing_en "${wingEn}" matches no wing`);
    }

    const roleKey = row.role.trim().toUpperCase();
    const role = CSV_ROLES[roleKey];
    if (!role) {
      problems.push(
        `${label}: role "${roleKey}" is not allowed in the CSV (use OFFICER or ADMIN)`,
      );
    }

    if (!nameBn || !nameEn || !designationId || (wingEn && !wingId) || !role)
      continue;

    // --- phones (warn + NULL on bad values) ------------------------------------------
    const phone = (
      column: 'mobile' | 'mobile_alt' | 'office_phone' | 'fax',
    ) => {
      const value = textOrNull(row[column]);
      if (value === null) return null;
      if (PHONE_PATTERN.test(value)) return value;
      const why = /e\+?\d+$/i.test(value)
        ? 'is in scientific notation (digits lost by Excel)'
        : 'is not a valid phone number';
      warnings.push({
        row: label,
        reason: `${column} ${why}; stored as empty`,
      });
      return null;
    };

    officers.push({
      row: label,
      loginEmail,
      nameBn,
      nameEn,
      designationId,
      designationRemark: textOrNull(row.designation_remark),
      wingId: wingId ?? null,
      organizationBn: textOrNull(row.organization_bn),
      organizationEn: textOrNull(row.organization_en),
      mobile: phone('mobile'),
      mobileAlt: phone('mobile_alt'),
      officePhone: phone('office_phone'),
      fax: phone('fax'),
      role,
      additionalCharges: splitCharges(row.additional_charges),
    });
  }

  if (problems.length > 0) throw new SeedDataError(problems);
  return { officers, skipped, warnings };
}
