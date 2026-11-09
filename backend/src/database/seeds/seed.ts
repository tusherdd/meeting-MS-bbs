/**
 * `npm run seed` — loads designations, wings, the super admin and officers (SPEC.md §11)
 * in ONE transaction, then prints a summary.
 *
 * Privacy: the CSV holds personal data. Output names rows only by source_sl / line number,
 * TypeORM query logging is OFF (a failed query would print its parameters), and database
 * errors are reported by code and constraint name only, never by their DETAIL text.
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource, QueryFailedError } from 'typeorm';
import { validateEnv } from '../../config/env.validation';
import { checkPasswordStrength } from '../../common/utils/password';
import { buildDataSourceOptions } from '../typeorm-options';
import { readOfficerCsv } from './officer-csv';
import { runSeed, type SeedSummary, type UpsertCounts } from './run-seed';
import { SeedDataError } from './seed-errors';

const CSV_PATH = join(__dirname, 'data', 'officers.csv');

function checkSeedPasswords(
  superAdminEmail: string,
  superAdminPassword: string,
  officerDefaultPassword: string,
): void {
  const problems: string[] = [];
  if (!superAdminPassword) {
    problems.push('SEED_SUPER_ADMIN_PASSWORD is empty');
  } else {
    for (const p of checkPasswordStrength(
      superAdminPassword,
      superAdminEmail,
    )) {
      problems.push(`SEED_SUPER_ADMIN_PASSWORD: ${p}`);
    }
  }
  // Already validated at startup (env.validation); checked again for a clear seed message.
  for (const p of checkPasswordStrength(officerDefaultPassword)) {
    problems.push(`DEFAULT_OFFICER_PASSWORD: ${p}`);
  }
  if (problems.length > 0) throw new SeedDataError(problems);
}

function counts(c: UpsertCounts): string {
  return `created ${c.created}, updated ${c.updated}, unchanged ${c.unchanged}`;
}

function printSummary(s: SeedSummary, csvRowCount: number): void {
  const o = s.officers;
  const lines = [
    '',
    '================ Seed summary ================',
    `Designations : ${counts(s.designations)}`,
    `Wings        : ${counts(s.wings)}`,
    `Super admin  : ${s.superAdmin}`,
    `Officers     : ${csvRowCount} CSV rows → created ${o.created}, already existing ${o.alreadyExisting}, skipped ${o.skipped.length}`,
    `Add. charges : created ${o.additionalChargesCreated}`,
  ];
  if (o.created > 0) {
    lines.push(
      'Passwords    : new officers got the default officer password (no forced change)',
    );
  }
  if (o.skipped.length > 0) {
    lines.push('Skipped rows :');
    for (const n of o.skipped) lines.push(`  - ${n.row}: ${n.reason}`);
  }
  if (o.warnings.length > 0) {
    lines.push('Warnings     :');
    for (const n of o.warnings) lines.push(`  - ${n.row}: ${n.reason}`);
  }
  lines.push('==============================================');
  console.log(lines.join('\n'));
}

function describeError(err: unknown): string {
  if (err instanceof SeedDataError) return err.message;
  if (err instanceof QueryFailedError) {
    // Do not print err.message / detail: they can contain emails or phone numbers.
    const driver = err.driverError as {
      code?: string;
      constraint?: string;
      table?: string;
    };
    return `Database error ${driver.code ?? ''} on table ${driver.table ?? '?'} (constraint ${driver.constraint ?? '?'})`;
  }
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

async function main(): Promise<void> {
  loadEnv({ path: join(__dirname, '..', '..', '..', '.env'), quiet: true });
  const env = validateEnv(process.env);

  checkSeedPasswords(
    env.SEED_SUPER_ADMIN_EMAIL,
    env.SEED_SUPER_ADMIN_PASSWORD,
    env.DEFAULT_OFFICER_PASSWORD,
  );
  const csvRows = readOfficerCsv(CSV_PATH);

  const dataSource = new DataSource({
    ...buildDataSourceOptions(env),
    logging: false,
  });
  await dataSource.initialize();
  try {
    const started = Date.now();
    const summary = await dataSource.transaction((manager) =>
      runSeed(manager, {
        csvRows,
        superAdminEmail: env.SEED_SUPER_ADMIN_EMAIL,
        superAdminPassword: env.SEED_SUPER_ADMIN_PASSWORD,
        officerDefaultPassword: env.DEFAULT_OFFICER_PASSWORD,
      }),
    );
    printSummary(summary, csvRows.length);
    console.log(
      `Done in ${((Date.now() - started) / 1000).toFixed(1)}s (one transaction, committed).`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(
    `\nSeed FAILED — nothing was written (transaction rolled back).\n${describeError(err)}`,
  );
  process.exit(1);
});
