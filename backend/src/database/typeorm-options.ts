import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { EnvVars } from '../config/env.validation';
import { SafeTypeOrmLogger } from '../common/logging/safe-typeorm-logger';
import { ENTITIES } from './entities';

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
    entities: ENTITIES,
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    // ids default to gen_random_uuid(), built into PostgreSQL 13+, so no extension is needed
    // (and the app user does not need CREATE EXTENSION rights).
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    migrationsTableName: 'typeorm_migrations',
    // Never log every query, and never any parameters: they can carry personal data.
    logging: ['error', 'warn', 'migration'],
    logger: new SafeTypeOrmLogger(),
    maxQueryExecutionTime: 2000, // slow-query warning (SQL text only)
    extra: {
      // Fail fast instead of hanging when the DB is unreachable.
      connectionTimeoutMillis: 5000,
    },
  };
}
