import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserOrgAndMobileAlt1794198728541 implements MigrationInterface {
  name = 'UserOrgAndMobileAlt1794198728541';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "organization"`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "mobileAlt" character varying(20)`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "organizationBn" text`);
    await queryRunner.query(`ALTER TABLE "users" ADD "organizationEn" text`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_designation_required" CHECK ("role" = 'SUPER_ADMIN' OR "designationId" IS NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "CHK_users_designation_required"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "organizationEn"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "organizationBn"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mobileAlt"`);
    await queryRunner.query(`ALTER TABLE "users" ADD "organization" text`);
  }
}
