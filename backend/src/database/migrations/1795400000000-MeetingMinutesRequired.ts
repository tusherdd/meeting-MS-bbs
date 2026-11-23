import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v1.19 (SPEC.md §6.9, §7): meetings.minutesRequired — the organizer decides per meeting whether
 * minutes "সভা কার্যবিবরণী" must be uploaded. NOT NULL DEFAULT true, so every existing meeting
 * keeps the old rule (Pending until a file exists).
 */
export class MeetingMinutesRequired1795400000000 implements MigrationInterface {
  name = 'MeetingMinutesRequired1795400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "meetings" ADD "minutesRequired" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "meetings" DROP COLUMN "minutesRequired"`,
    );
  }
}
