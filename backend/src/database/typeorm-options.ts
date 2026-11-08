import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { EnvVars } from '../config/env.validation';

type DbEnv = Pick<
  EnvVars,
  'NODE_ENV' | 'DB_HOST' | 'DB_PORT' | 'DB_USER' | 'DB_PASSWORD' | 'DB_NAME'
>;

/**
 * Single source of TypeORM settings, shared by the Nest app and the migration CLI
 * (data-source.ts) so both always connect the same way.
 */
export function buildDataSourceOptions(env: DbEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    // Schema changes only through migrations (SPEC.md §3, CLAUDE.md).
    synchronize: false,
    migrationsRun: false,
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'typeorm_migrations',
    // Never log every query: queries can carry personal data.
    logging: ['error', 'warn', 'migration'],
    extra: {
      // Fail fast instead of hanging when the DB is unreachable.
      connectionTimeoutMillis: 5000,
    },
  };
}
