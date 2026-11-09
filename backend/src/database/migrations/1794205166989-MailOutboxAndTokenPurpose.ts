import { MigrationInterface, QueryRunner } from 'typeorm';

export class MailOutboxAndTokenPurpose1794205166989 implements MigrationInterface {
  name = 'MailOutboxAndTokenPurpose1794205166989';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" ADD "purpose" character varying(20) NOT NULL DEFAULT 'RESET'`,
    );
    await queryRunner.query(`ALTER TABLE "email_outbox" ADD "text" text`);
    await queryRunner.query(
      `ALTER TABLE "email_outbox" ALTER COLUMN "html" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_outbox" ALTER COLUMN "html" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "email_outbox" DROP COLUMN "text"`);
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" DROP COLUMN "purpose"`,
    );
  }
}
