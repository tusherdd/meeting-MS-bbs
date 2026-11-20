import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  matchCharge,
  type NamedRef,
} from '../../modules/users/additional-charge-match';

/**
 * v1.16 (SPEC.md §6.2): structured additional charges.
 * - `description` → `note` (the original text is kept; nothing is deleted);
 * - `designationId` (→ designations, RESTRICT), `wingId` (→ wings, RESTRICT), `needsReview`;
 * - a check: a row has a designation unless it needs review.
 * Existing rows are matched with matchCharge() (whole-word designation / wing names); rows without a
 * safe match keep `needsReview = true`. Only the counts are printed — never names or texts.
 */
export class StructuredAdditionalCharges1795200000000 implements MigrationInterface {
  name = 'StructuredAdditionalCharges1795200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" RENAME COLUMN "description" TO "note"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" ALTER COLUMN "note" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" ADD "designationId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" ADD "wingId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" ADD "needsReview" boolean NOT NULL DEFAULT false`,
    );

    const designations = (await queryRunner.query(
      `SELECT "id", "nameBn", "nameEn" FROM "designations"`,
    )) as NamedRef[];
    const wings = (await queryRunner.query(
      `SELECT "id", "nameBn", "nameEn" FROM "wings"`,
    )) as NamedRef[];
    const rows = (await queryRunner.query(
      `SELECT "id", "note" FROM "user_additional_charges"`,
    )) as Array<{ id: string; note: string | null }>;
    let matched = 0;
    let review = 0;
    for (const row of rows) {
      const m = matchCharge(row.note ?? '', designations, wings);
      await queryRunner.query(
        `UPDATE "user_additional_charges" SET "designationId" = $2, "wingId" = $3, "needsReview" = $4 WHERE "id" = $1`,
        [row.id, m.designationId, m.wingId, m.needsReview],
      );
      if (m.needsReview) review++;
      else matched++;
    }

    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" ADD CONSTRAINT "CHK_user_additional_charges_designation" CHECK ("needsReview" OR "designationId" IS NOT NULL)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" ADD CONSTRAINT "FK_user_additional_charges_designation" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" ADD CONSTRAINT "FK_user_additional_charges_wing" FOREIGN KEY ("wingId") REFERENCES "wings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    console.log(
      `[StructuredAdditionalCharges] rows: ${rows.length}, matched: ${matched}, needs review: ${review}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" DROP CONSTRAINT "FK_user_additional_charges_wing"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" DROP CONSTRAINT "FK_user_additional_charges_designation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" DROP CONSTRAINT "CHK_user_additional_charges_designation"`,
    );
    // Rows created after v1.16 may have no note: keep their designation name as the text.
    await queryRunner.query(
      `UPDATE "user_additional_charges" c SET "note" = d."nameBn" FROM "designations" d WHERE c."note" IS NULL AND d."id" = c."designationId"`,
    );
    await queryRunner.query(
      `UPDATE "user_additional_charges" SET "note" = '' WHERE "note" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" DROP COLUMN "needsReview"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" DROP COLUMN "wingId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" DROP COLUMN "designationId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" ALTER COLUMN "note" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_additional_charges" RENAME COLUMN "note" TO "description"`,
    );
  }
}
