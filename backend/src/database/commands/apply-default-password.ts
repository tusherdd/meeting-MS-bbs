/**
 * One-off command (owner decision 2026-11-09, SPEC.md §6.2):
 *   npm run users:apply-default-password -- --dry-run   → counts only, nothing changes
 *   npm run users:apply-default-password -- --yes       → applies it (one transaction)
 * Sets DEFAULT_OFFICER_PASSWORD for every OFFICER and ADMIN account (not the SUPER_ADMIN, not
 * test accounts ending in @example.com), revokes their sessions and writes one audit entry.
 * Prints counts only: never the password, emails or names.
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { validateEnv } from '../../config/env.validation';
import { applyDefaultPassword } from '../../modules/users/apply-default-password';
import { buildDataSourceOptions } from '../typeorm-options';

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const yes = args.has('--yes');
  if (dryRun === yes) {
    console.error(
      'Use exactly one of: --dry-run (count only) or --yes (apply).',
    );
    process.exitCode = 2;
    return;
  }

  loadEnv({ path: join(__dirname, '..', '..', '..', '.env'), quiet: true });
  const env = validateEnv(process.env);
  const dataSource = new DataSource({
    ...buildDataSourceOptions(env),
    logging: false,
  });
  await dataSource.initialize();
  try {
    const result = await dataSource.transaction((manager) =>
      applyDefaultPassword(manager, env.DEFAULT_OFFICER_PASSWORD, dryRun),
    );
    console.log(
      dryRun
        ? `Dry run: ${result.users} accounts would get the default officer password; ${result.revokedSessions} active sessions would be ended. Nothing was changed.`
        : `Done: ${result.users} accounts now use the default officer password; ${result.revokedSessions} sessions ended; 1 audit log entry written.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  // Only the error type and message (no row data).
  console.error(
    err instanceof Error ? `${err.name}: ${err.message}` : 'Unknown error',
  );
  process.exitCode = 1;
});
