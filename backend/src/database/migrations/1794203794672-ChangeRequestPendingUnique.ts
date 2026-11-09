import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * At most one PENDING change request per user and type (step 6). Partial unique index, so it
 * is race-safe even when two requests arrive at the same time. Hand-written: TypeORM cannot
 * generate partial indexes; the entity declares it with `synchronize: false`.
 */
export class ChangeRequestPendingUnique1794203794672 implements MigrationInterface {
  name = 'ChangeRequestPendingUnique1794203794672';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_change_requests_one_pending" ON "change_requests" ("userId", "type") WHERE "status" = 'PENDING'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_change_requests_one_pending"`,
    );
  }
}
