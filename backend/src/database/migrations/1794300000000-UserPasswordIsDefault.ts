import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner decision 2026-11-09 (SPEC.md §6.2): officers share one default password.
 * passwordIsDefault = the account still uses it (true after seed / admin create / admin reset /
 * the apply-default-password command; false after the user's own change or a reset link).
 */
export class UserPasswordIsDefault1794300000000 implements MigrationInterface {
  name = 'UserPasswordIsDefault1794300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "passwordIsDefault" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "passwordIsDefault"`,
    );
  }
}
