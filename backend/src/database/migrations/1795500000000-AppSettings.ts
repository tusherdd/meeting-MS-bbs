import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v1.21 part 2 (SPEC.md §6.13, §7): app_settings — a small key-value table for app-wide settings
 * (first key: noticeExtractionMethod). No rows are inserted: a missing key means its default
 * (OCR). updatedById → users with SET NULL.
 */
export class AppSettings1795500000000 implements MigrationInterface {
  name = 'AppSettings1795500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "app_settings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "key" character varying(100) NOT NULL, "value" character varying(500) NOT NULL, "updatedById" uuid, CONSTRAINT "PK_app_settings" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_app_settings_key" ON "app_settings" ("key") `,
    );
    await queryRunner.query(
      `ALTER TABLE "app_settings" ADD CONSTRAINT "FK_app_settings_updatedById" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "app_settings" DROP CONSTRAINT "FK_app_settings_updatedById"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_app_settings_key"`);
    await queryRunner.query(`DROP TABLE "app_settings"`);
  }
}
