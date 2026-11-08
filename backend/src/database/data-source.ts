/**
 * TypeORM DataSource for the CLI (migration:generate / run / revert).
 * The CLI does not boot Nest, so it loads `.env` itself and validates it with the
 * same schema as the app: a bad or weak config stops migrations too.
 */
import 'reflect-metadata';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation';
import { buildDataSourceOptions } from './typeorm-options';

loadEnv({ path: join(__dirname, '..', '..', '.env'), quiet: true });

const env = validateEnv(process.env);

export default new DataSource(buildDataSourceOptions(env));
