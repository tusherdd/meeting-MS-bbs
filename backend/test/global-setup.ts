/**
 * Once before all e2e tests: migrate the TEST database and empty it, so every run starts
 * from a clean, fully migrated schema. The dev database is never opened.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateEnv } from '../src/config/env.validation';
import { buildDataSourceOptions } from '../src/database/typeorm-options';
import { loadE2eEnv } from './e2e-env';

export default async function globalSetup(): Promise<void> {
  const testDb = loadE2eEnv();
  const env = validateEnv(process.env);
  if (env.DB_NAME !== testDb)
    throw new Error('e2e: refusing to migrate a non-test database');

  const ds = new DataSource({ ...buildDataSourceOptions(env), logging: false });
  await ds.initialize();
  try {
    const [{ current }] = await ds.query<Array<{ current: string }>>(
      'SELECT current_database() AS current',
    );
    if (current !== testDb)
      throw new Error(`e2e: connected to ${current}, expected ${testDb}`);

    await ds.runMigrations({ transaction: 'each' });
    const tables = await ds.query<Array<{ tablename: string }>>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'typeorm_migrations'`,
    );
    if (tables.length > 0) {
      await ds.query(
        `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
      );
    }
  } finally {
    await ds.destroy();
  }
}
