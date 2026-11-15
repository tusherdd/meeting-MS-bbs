import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SPEC.md §13.13: Bangla nukta letters in the form the fonts draw correctly — ড় and ঢ় precomposed
 * (U+09DC, U+09DD), য় as য + ় (U+09AF U+09BC). The same rule as common/utils/bangla.ts
 * normalizeBangla(), applied in place to every text, varchar and jsonb column of the public schema
 * (names, designations, wings, additional charges, meetings, notifications, mails, audit logs …).
 *
 * Idempotent: only rows that still contain U+09DF, ড+় or ঢ+় are updated, so running it again
 * changes nothing. Down does nothing: the old form was a rendering bug, not data worth restoring.
 */
export class NormalizeBanglaNukta1794400000000 implements MigrationInterface {
  name = 'NormalizeBanglaNukta1794400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = (await queryRunner.query(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND data_type IN ('text', 'character varying', 'jsonb')
          AND table_name <> 'typeorm_migrations'
        ORDER BY table_name, column_name`,
    )) as { table_name: string; column_name: string; data_type: string }[];

    // Built from code points (a migration must not depend on app code that may change later).
    const ch = (...codes: number[]) => String.fromCharCode(...codes);
    const params = [
      ch(0x09df), // $1 YYA precomposed
      ch(0x09af, 0x09bc), // $2 YA + NUKTA
      ch(0x09a1, 0x09bc), // $3 DDA + NUKTA
      ch(0x09dc), // $4 RRA precomposed
      ch(0x09a2, 0x09bc), // $5 DDHA + NUKTA
      ch(0x09dd), // $6 RHA precomposed
    ];

    for (const { table_name, column_name, data_type } of columns) {
      const col = `"${column_name}"`;
      const asText = data_type === 'jsonb' ? `${col}::text` : col;
      const fixed = `replace(replace(replace(${asText}, $1::text, $2::text), $3::text, $4::text), $5::text, $6::text)`;
      await queryRunner.query(
        `UPDATE "${table_name}"
            SET ${col} = ${data_type === 'jsonb' ? `${fixed}::jsonb` : fixed}
          WHERE strpos(${asText}, $1::text) > 0
             OR strpos(${asText}, $3::text) > 0
             OR strpos(${asText}, $5::text) > 0`,
        params,
      );
    }
  }

  public async down(): Promise<void> {
    // Nothing to undo (see the class comment).
  }
}
