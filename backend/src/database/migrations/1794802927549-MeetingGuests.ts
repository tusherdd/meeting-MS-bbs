import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v1.5 (SPEC.md §6.7): guest officers — people invited to a meeting who have no account.
 * Besides the table (generated from the MeetingGuest entity) this adds what decorators cannot
 * express:
 * - UQ_meeting_guests_meetingId_email: one guest per address per meeting (case-insensitive);
 * - UQ_meeting_guests_one_chair: at most one guest chair per meeting;
 * - CHK_meeting_guests_email_lowercase: emails are stored trimmed and lowercased;
 * - TRG_meeting_single_chair (deferred constraint triggers on both tables): a meeting never has
 *   an officer chair (meetings.chairId) and a guest chair at the same time. Deferred to COMMIT,
 *   so a transaction may switch the chair from one kind to the other in any order.
 */
export class MeetingGuests1794802927549 implements MigrationInterface {
  name = 'MeetingGuests1794802927549';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "meeting_guests" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "meetingId" uuid NOT NULL, "name" character varying(200) NOT NULL, "designation" character varying(200) NOT NULL, "email" character varying(254) NOT NULL, "isChair" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_2ecc3a5a3d1ddc461089cc73ad4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_meeting_guests_meetingId" ON "meeting_guests" ("meetingId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_guests" ADD CONSTRAINT "FK_a82cb8159088239de6238ee8783" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_meeting_guests_meetingId_email" ON "meeting_guests" ("meetingId", lower("email"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_meeting_guests_one_chair" ON "meeting_guests" ("meetingId") WHERE "isChair"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_guests" ADD CONSTRAINT "CHK_meeting_guests_email_lowercase" CHECK ("email" = lower(btrim("email")))`,
    );

    await queryRunner.query(`
      CREATE FUNCTION meeting_single_chair_check() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        mid uuid;
      BEGIN
        -- IF, not CASE: a record field is resolved even in a CASE branch that is not taken.
        IF TG_TABLE_NAME = 'meetings' THEN
          mid := NEW."id";
        ELSE
          mid := NEW."meetingId";
        END IF;
        IF EXISTS (
          SELECT 1 FROM meetings m
           WHERE m."id" = mid AND m."chairId" IS NOT NULL
             AND EXISTS (SELECT 1 FROM meeting_guests g WHERE g."meetingId" = m."id" AND g."isChair")
        ) THEN
          RAISE EXCEPTION 'meeting % has both an officer chair and a guest chair', mid
            USING ERRCODE = '23514';
        END IF;
        RETURN NULL;
      END $$`);
    await queryRunner.query(
      `CREATE CONSTRAINT TRIGGER "TRG_meeting_single_chair_meetings" AFTER INSERT OR UPDATE OF "chairId" ON "meetings" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION meeting_single_chair_check()`,
    );
    await queryRunner.query(
      `CREATE CONSTRAINT TRIGGER "TRG_meeting_single_chair_guests" AFTER INSERT OR UPDATE OF "isChair" ON "meeting_guests" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION meeting_single_chair_check()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "TRG_meeting_single_chair_guests" ON "meeting_guests"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "TRG_meeting_single_chair_meetings" ON "meetings"`,
    );
    await queryRunner.query(`DROP FUNCTION meeting_single_chair_check()`);
    await queryRunner.query(
      `ALTER TABLE "meeting_guests" DROP CONSTRAINT "FK_a82cb8159088239de6238ee8783"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_meeting_guests_meetingId"`,
    );
    await queryRunner.query(`DROP TABLE "meeting_guests"`);
  }
}
