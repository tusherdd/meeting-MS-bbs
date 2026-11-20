import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v1.15 (SPEC.md §6.10): designations.officeReportScope NONE | WING | OFFICE (default NONE).
 * Backfill (owner decision 2026-11-20): সচিব and মহাপরিচালক → OFFICE, পরিচালক → WING (matched by the
 * Bangla or the English name). The migration prints which designations were set.
 */
export class DesignationOfficeReportScope1795100000000 implements MigrationInterface {
  name = 'DesignationOfficeReportScope1795100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."office_report_scope_enum" AS ENUM('NONE', 'WING', 'OFFICE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "designations" ADD "officeReportScope" "public"."office_report_scope_enum" NOT NULL DEFAULT 'NONE'`,
    );
    const office = (await queryRunner.query(
      `UPDATE "designations" SET "officeReportScope" = 'OFFICE'
       WHERE "nameBn" IN ($1, $2) OR lower("nameEn") IN ($3, $4)
       RETURNING "nameBn"`,
      ['সচিব', 'মহাপরিচালক', 'secretary', 'director general'],
    )) as unknown;
    const wing = (await queryRunner.query(
      `UPDATE "designations" SET "officeReportScope" = 'WING'
       WHERE "nameBn" = $1 OR lower("nameEn") = $2
       RETURNING "nameBn"`,
      ['পরিচালক', 'director'],
    )) as unknown;
    console.log(
      `[DesignationOfficeReportScope] OFFICE: ${names(office)}; WING: ${names(wing)}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "designations" DROP COLUMN "officeReportScope"`,
    );
    await queryRunner.query(`DROP TYPE "public"."office_report_scope_enum"`);
  }
}

/** pg returns [rows, count] for UPDATE … RETURNING through TypeORM's query runner. */
function names(result: unknown): string {
  const rows = (
    Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result
  ) as Array<{ nameBn: string }>;
  return Array.isArray(rows) && rows.length > 0
    ? rows.map((r) => r.nameBn).join(', ')
    : '—';
}
