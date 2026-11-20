/**
 * v1.15 (SPEC.md §6.10): who may open the office report "অফিস রিপোর্ট", set per designation on
 * Admin → "পদবি ও অগ্রাধিকার" as "অফিস রিপোর্ট: নেই / নিজ উইং / পুরো অফিস".
 * ADMIN and SUPER_ADMIN always have OFFICE.
 */
export enum OfficeReportScope {
  NONE = 'NONE',
  WING = 'WING',
  OFFICE = 'OFFICE',
}

/** Ordered from least to most. */
export const OFFICE_REPORT_SCOPES = [
  OfficeReportScope.NONE,
  OfficeReportScope.WING,
  OfficeReportScope.OFFICE,
] as const;
