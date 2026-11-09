import { MigrationInterface, QueryRunner } from 'typeorm';

export class MeetingConflictIndexes1794214531030 implements MigrationInterface {
  name = 'MeetingConflictIndexes1794214531030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_meeting_conflicts_higherMeetingId" ON "meeting_conflicts" ("higherMeetingId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_meeting_conflicts_lowerMeetingId" ON "meeting_conflicts" ("lowerMeetingId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_meeting_conflicts_userId_status" ON "meeting_conflicts" ("userId", "status") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_meeting_conflicts_userId_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_meeting_conflicts_lowerMeetingId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_meeting_conflicts_higherMeetingId"`,
    );
  }
}
