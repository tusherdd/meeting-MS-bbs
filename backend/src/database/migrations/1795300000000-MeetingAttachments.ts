import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v1.17 part 2 (SPEC.md §6.11, §7): meeting_attachments — the other attachments "অন্যান্য সংযুক্তি"
 * of a meeting (at most 5, checked in the service). Rows go with their meeting (CASCADE); an
 * uploader cannot be hard-deleted while an attachment of theirs exists (RESTRICT; users are
 * deactivated, never deleted). Indexed by meetingId.
 */
export class MeetingAttachments1795300000000 implements MigrationInterface {
  name = 'MeetingAttachments1795300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "meeting_attachments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "meetingId" uuid NOT NULL, "name" character varying(150) NOT NULL, "originalName" character varying(200) NOT NULL, "storedName" character varying(64) NOT NULL, "mime" character varying(100) NOT NULL, "size" integer NOT NULL, "sha256" character(64) NOT NULL, "uploadedById" uuid NOT NULL, CONSTRAINT "PK_fcaaa05c07f248d827d939e808a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_meeting_attachments_meetingId" ON "meeting_attachments" ("meetingId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_attachments" ADD CONSTRAINT "FK_471e6f656bd419654d1be60f9a8" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_attachments" ADD CONSTRAINT "FK_066d1d2896e79d4f14410a460b0" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "meeting_attachments" DROP CONSTRAINT "FK_066d1d2896e79d4f14410a460b0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_attachments" DROP CONSTRAINT "FK_471e6f656bd419654d1be60f9a8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_meeting_attachments_meetingId"`,
    );
    await queryRunner.query(`DROP TABLE "meeting_attachments"`);
  }
}
