import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1794196726794 implements MigrationInterface {
  name = 'InitialSchema1794196726794';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "designations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "nameBn" character varying(150) NOT NULL, "nameEn" character varying(150) NOT NULL, "priority" integer NOT NULL, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_a0f024b99b1491a03fc421858ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "wings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "nameBn" character varying(200) NOT NULL, "nameEn" character varying(200) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_fe53a46787e53588b5ebf4c5d06" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_additional_charges" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "description" character varying(300) NOT NULL, CONSTRAINT "PK_236aa8888f94a7e9aae1e0d7d2d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "loginEmail" character varying(254) NOT NULL, "notificationEmail" character varying(254) NOT NULL, "pendingNotificationEmail" character varying(254), "notificationEmailTokenHash" character varying(128), "notificationEmailTokenExpiresAt" TIMESTAMP WITH TIME ZONE, "passwordHash" character varying(255) NOT NULL, "nameBn" character varying(200) NOT NULL, "nameEn" character varying(200) NOT NULL, "mobile" character varying(20), "officePhone" character varying(50), "fax" character varying(50), "photoPath" character varying(255), "designationId" uuid, "designationRemark" character varying(100), "wingId" uuid, "organization" text, "bcsBatch" character varying(50), "role" character varying(20) NOT NULL DEFAULT 'OFFICER', "isActive" boolean NOT NULL DEFAULT true, "mustChangePassword" boolean NOT NULL DEFAULT true, "failedLoginCount" integer NOT NULL DEFAULT '0', "lockedUntil" TIMESTAMP WITH TIME ZONE, "lastLoginAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_users_pendingNotificationEmail_lowercase" CHECK ("pendingNotificationEmail" = lower("pendingNotificationEmail")), CONSTRAINT "CHK_users_notificationEmail_lowercase" CHECK ("notificationEmail" = lower("notificationEmail")), CONSTRAINT "CHK_users_loginEmail_lowercase" CHECK ("loginEmail" = lower("loginEmail")), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_loginEmail" ON "users" ("loginEmail") `,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actorId" uuid, "action" character varying(100) NOT NULL, "entityType" character varying(100) NOT NULL, "entityId" character varying(100), "before" jsonb, "after" jsonb, "ip" character varying(45), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "tokenHash" character varying(128) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_password_reset_tokens_tokenHash" ON "password_reset_tokens" ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "tokenHash" character varying(128) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, "replacedById" uuid, "userAgent" character varying(500), "ip" character varying(45), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_refresh_tokens_tokenHash" ON "refresh_tokens" ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "change_requests" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "type" character varying(30) NOT NULL, "newValue" jsonb NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'PENDING', "reviewedById" uuid, "reviewedAt" TIMESTAMP WITH TIME ZONE, "reviewNote" text, CONSTRAINT "PK_e3f28255a6e818820f18f6d5956" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "email_outbox" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "to" character varying(254) NOT NULL, "subject" character varying(500) NOT NULL, "html" text NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'PENDING', "attempts" integer NOT NULL DEFAULT '0', "lastError" text, "nextAttemptAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "sentAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_b6fbfc201f705fbf1ac87bd7197" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_outbox_status_nextAttemptAt" ON "email_outbox" ("status", "nextAttemptAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "meeting_participants" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "meetingId" uuid NOT NULL, "userId" uuid NOT NULL, "role" character varying(10) NOT NULL DEFAULT 'MEMBER', CONSTRAINT "PK_994ee66a92de655fb478c038980" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_meeting_participants_userId" ON "meeting_participants" ("userId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_meeting_participants_meetingId_userId" ON "meeting_participants" ("meetingId", "userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "meetings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" character varying(300) NOT NULL, "agenda" text, "startAt" TIMESTAMP WITH TIME ZONE NOT NULL, "endAt" TIMESTAMP WITH TIME ZONE NOT NULL, "room" character varying(200), "onlineLink" character varying(1000), "organizerId" uuid NOT NULL, "chairId" uuid, "priority" integer NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'SCHEDULED', "cancelReason" text, "notes" text, "cancelledAt" TIMESTAMP WITH TIME ZONE, "completedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_meetings_endAt_after_startAt" CHECK ("endAt" > "startAt"), CONSTRAINT "PK_aa73be861afa77eb4ed31f3ed57" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_meetings_startAt_endAt_status" ON "meetings" ("startAt", "endAt", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "meeting_conflicts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "higherMeetingId" uuid NOT NULL, "lowerMeetingId" uuid NOT NULL, "userId" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'PENDING', "resolvedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_bc74e3ecc828805c1a3da01c357" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "type" character varying(50) NOT NULL, "title" character varying(300) NOT NULL, "body" text NOT NULL, "link" character varying(500), "readAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_userId_readAt" ON "notifications" ("userId", "readAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" ADD CONSTRAINT "FK_83a3a3ef09ef20781256b17de4f" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_071a5e4a3131d00a0fc700af411" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_e6df0d0d096c1c20d57128b5c71" FOREIGN KEY ("wingId") REFERENCES "wings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_2dc33f7f3c22e2e7badafca1d12" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_d6a19d4b4f6c62dcd29daa497e2" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_610102b60fea1455310ccd299de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_2ed2be3b03a9eebf7123f2a9412" FOREIGN KEY ("replacedById") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "change_requests" ADD CONSTRAINT "FK_e5cbca2c14e18b349f7c0dae4d8" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "change_requests" ADD CONSTRAINT "FK_0ff5db90fdd3b7a57bc5f8aab4f" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_participants" ADD CONSTRAINT "FK_73193d0c84f0a62e423fc513027" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_participants" ADD CONSTRAINT "FK_7513a0c94f27d1ea7842a8be6ea" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meetings" ADD CONSTRAINT "FK_82c1bb849068f3525109b34aa80" FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meetings" ADD CONSTRAINT "FK_421e8f7fb6e6d9d739001322785" FOREIGN KEY ("chairId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_conflicts" ADD CONSTRAINT "FK_a628eef810ee308dcda8d081b1c" FOREIGN KEY ("higherMeetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_conflicts" ADD CONSTRAINT "FK_213c426e8386d101584f48acb80" FOREIGN KEY ("lowerMeetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_conflicts" ADD CONSTRAINT "FK_e31295edae406db2bfad13b057b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_692a909ee0fa9383e7859f9b406" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_692a909ee0fa9383e7859f9b406"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_conflicts" DROP CONSTRAINT "FK_e31295edae406db2bfad13b057b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_conflicts" DROP CONSTRAINT "FK_213c426e8386d101584f48acb80"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_conflicts" DROP CONSTRAINT "FK_a628eef810ee308dcda8d081b1c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meetings" DROP CONSTRAINT "FK_421e8f7fb6e6d9d739001322785"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meetings" DROP CONSTRAINT "FK_82c1bb849068f3525109b34aa80"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_participants" DROP CONSTRAINT "FK_7513a0c94f27d1ea7842a8be6ea"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meeting_participants" DROP CONSTRAINT "FK_73193d0c84f0a62e423fc513027"`,
    );
    await queryRunner.query(
      `ALTER TABLE "change_requests" DROP CONSTRAINT "FK_0ff5db90fdd3b7a57bc5f8aab4f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "change_requests" DROP CONSTRAINT "FK_e5cbca2c14e18b349f7c0dae4d8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_2ed2be3b03a9eebf7123f2a9412"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_610102b60fea1455310ccd299de"`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_d6a19d4b4f6c62dcd29daa497e2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_2dc33f7f3c22e2e7badafca1d12"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_e6df0d0d096c1c20d57128b5c71"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_071a5e4a3131d00a0fc700af411"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" DROP CONSTRAINT "FK_83a3a3ef09ef20781256b17de4f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notifications_userId_readAt"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TABLE "meeting_conflicts"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_meetings_startAt_endAt_status"`,
    );
    await queryRunner.query(`DROP TABLE "meetings"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_meeting_participants_meetingId_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_meeting_participants_userId"`,
    );
    await queryRunner.query(`DROP TABLE "meeting_participants"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_email_outbox_status_nextAttemptAt"`,
    );
    await queryRunner.query(`DROP TABLE "email_outbox"`);
    await queryRunner.query(`DROP TABLE "change_requests"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_refresh_tokens_tokenHash"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_userId"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_password_reset_tokens_tokenHash"`,
    );
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_users_loginEmail"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "user_additional_charges"`);
    await queryRunner.query(`DROP TABLE "wings"`);
    await queryRunner.query(`DROP TABLE "designations"`);
  }
}
