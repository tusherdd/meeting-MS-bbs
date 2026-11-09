/**
 * Raised when seed input is wrong in a way a human must fix (unknown designation, bad CSV
 * header, weak password ...). Messages must never contain personal data: use source_sl / line
 * numbers and column names only.
 */
export class SeedDataError extends Error {
  constructor(readonly problems: string[]) {
    super(`Seed data problems:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'SeedDataError';
  }
}
