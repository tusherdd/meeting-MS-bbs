import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Case-insensitive unique English names for designations and wings (step 5).
 * Hand-written: TypeORM cannot generate expression indexes. The entities declare these
 * indexes with `synchronize: false` so later migration:generate runs leave them alone.
 */
export class UniqueDesignationWingNames1794202664020 implements MigrationInterface {
  name = 'UniqueDesignationWingNames1794202664020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_designations_nameEn_lower" ON "designations" (lower("nameEn"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_wings_nameEn_lower" ON "wings" (lower("nameEn"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_wings_nameEn_lower"`);
    await queryRunner.query(
      `DROP INDEX "public"."UQ_designations_nameEn_lower"`,
    );
  }
}
