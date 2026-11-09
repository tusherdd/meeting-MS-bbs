/**
 * Environment for e2e tests: backend/.env with backend/.env.test on top, then DB_NAME is
 * replaced by DB_NAME_TEST. Refuses to continue if that could point at the dev database.
 * Used by global-setup.ts (migrations) and setup-env.ts (every test file).
 */
import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function readEnvFile(name: string): Record<string, string> {
  const file = join(ROOT, name);
  if (!existsSync(file)) {
    throw new Error(`e2e: ${name} is missing (copy ${name}.example)`);
  }
  return parse(readFileSync(file));
}

export function loadE2eEnv(): string {
  const dev = readEnvFile('.env');
  const test = readEnvFile('.env.test');
  const testDb = test.DB_NAME_TEST?.trim();

  if (!testDb) throw new Error('e2e: DB_NAME_TEST is not set in .env.test');
  if (testDb === dev.DB_NAME?.trim()) {
    throw new Error('e2e: DB_NAME_TEST must not be the development database');
  }
  if (!/_test$/.test(testDb)) {
    throw new Error('e2e: DB_NAME_TEST must end with "_test" (safety net)');
  }

  Object.assign(process.env, dev, test, {
    DB_NAME: testDb,
    NODE_ENV: 'test',
    // Never send real mail and never run cron jobs unless a test does it explicitly.
    MAIL_DRY_RUN: 'true',
    SCHEDULER_ENABLED: test.SCHEDULER_ENABLED ?? 'false',
  });
  // Already checked against the dev DB_NAME above; inside the test process DB_NAME IS the test
  // database, so the variable is not needed any more (and would fail the env schema check).
  delete process.env.DB_NAME_TEST;
  return testDb;
}
