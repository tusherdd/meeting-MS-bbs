/**
 * Reads the officer list (SPEC.md §11.4). The file holds personal data: never log row contents.
 */
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { SeedDataError } from './seed-errors';

export const OFFICER_CSV_COLUMNS = [
  'source_sl',
  'name_bn',
  'name_en',
  'designation_bn',
  'designation_en',
  'designation_remark',
  'wing_bn',
  'wing_en',
  'organization_bn',
  'organization_en',
  'login_email',
  'mobile',
  'mobile_alt',
  'office_phone',
  'fax',
  'additional_charges',
  'role',
] as const;

export type OfficerCsvColumn = (typeof OFFICER_CSV_COLUMNS)[number];

/** One CSV record plus the file line it came from (for reports without personal data). */
export type OfficerCsvRow = Record<OfficerCsvColumn, string> & { line: number };

interface ParsedRecord {
  record: Record<string, string>;
  info: { lines: number };
}

export function parseOfficerCsv(content: string | Buffer): OfficerCsvRow[] {
  let header: string[] = [];
  const parsed = parse(content, {
    bom: true, // Excel adds a UTF-8 BOM
    encoding: 'utf8',
    columns: (h: string[]) => (header = h.map((c) => c.trim())),
    skip_empty_lines: true,
    info: true, // gives the line number of each record
  }) as unknown as ParsedRecord[];

  const missing = OFFICER_CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new SeedDataError([
      `officers.csv is missing column(s): ${missing.join(', ')}`,
    ]);
  }

  return parsed.map(({ record, info }) => {
    const row = { line: info.lines } as OfficerCsvRow;
    for (const column of OFFICER_CSV_COLUMNS) {
      row[column] = record[column] ?? '';
    }
    return row;
  });
}

export function readOfficerCsv(path: string): OfficerCsvRow[] {
  return parseOfficerCsv(readFileSync(path));
}
