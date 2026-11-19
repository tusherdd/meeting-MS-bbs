import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v1.13 (SPEC.md §6.8, §6.9):
 * - meeting_notice_files: the uploaded meeting notice "সভার নোটিশ", at most one per meeting
 *   (unique meetingId). Rows go with their meeting (CASCADE); an uploader cannot be hard-deleted
 *   while a notice of theirs exists (RESTRICT; users are deactivated, never deleted).
 * - meeting_decision_files.mime widened to 100: the DOCX type is 71 characters long.
 */
export class MeetingNoticeFiles1795000000000 implements MigrationInterface {
  name = 'MeetingNoticeFiles1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "meeting_notice_files" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "meetingId" uuid NOT NULL, "uploadedById" uuid NOT NULL, "originalName" character varying(200) NOT NULL, "storedName" character varying(64) NOT NULL, "mime" character varying(100) NOT NULL, "size" integer NOT NULL, "sha256" character(64) NOT NULL, CONSTRAINT "PK_meeting_notice_files" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_meeting_notice_files_meetingId" ON "meeting_notice_files" ("meetingId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_notice_files" ADD CONSTRAINT "FK_f35df64e9741588ed6401f1bf10" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_notice_files" ADD CONSTRAINT "FK_dde39dcf706f4267c63582f0009" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_decision_files" ALTER COLUMN "mime" TYPE character varying(100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Shortening fails if a DOCX row exists; remove those files first when rolling back.
    await queryRunner.query(
      `ALTER TABLE "meeting_decision_files" ALTER COLUMN "mime" TYPE character varying(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_notice_files" DROP CONSTRAINT "FK_dde39dcf706f4267c63582f0009"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_notice_files" DROP CONSTRAINT "FK_f35df64e9741588ed6401f1bf10"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_meeting_notice_files_meetingId"`,
    );
    await queryRunner.query(`DROP TABLE "meeting_notice_files"`);
  }
}
