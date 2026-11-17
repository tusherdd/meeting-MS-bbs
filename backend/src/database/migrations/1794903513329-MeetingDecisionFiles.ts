import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v1.11 (SPEC.md §6.9): meeting decision files. One row per stored file (metadata only; the
 * bytes live under DECISION_UPLOAD_DIR). Rows go with their meeting (CASCADE); an uploader
 * cannot be hard-deleted while their files exist (RESTRICT; users are deactivated, never deleted).
 */

export class MeetingDecisionFiles1794903513329 implements MigrationInterface {
  name = 'MeetingDecisionFiles1794903513329';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "meeting_decision_files" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "meetingId" uuid NOT NULL, "uploadedById" uuid NOT NULL, "originalName" character varying(200) NOT NULL, "storedName" character varying(64) NOT NULL, "mime" character varying(50) NOT NULL, "size" integer NOT NULL, "sha256" character(64) NOT NULL, CONSTRAINT "PK_13506127e8141a65f0b7e623e14" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_meeting_decision_files_meetingId" ON "meeting_decision_files" ("meetingId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_decision_files" ADD CONSTRAINT "FK_57d0d9b29c0a3900fe393441f84" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_decision_files" ADD CONSTRAINT "FK_7328dea42f01db4b930d6880f26" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "meeting_decision_files" DROP CONSTRAINT "FK_7328dea42f01db4b930d6880f26"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_decision_files" DROP CONSTRAINT "FK_57d0d9b29c0a3900fe393441f84"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_meeting_decision_files_meetingId"`,
    );
    await queryRunner.query(`DROP TABLE "meeting_decision_files"`);
  }
}
