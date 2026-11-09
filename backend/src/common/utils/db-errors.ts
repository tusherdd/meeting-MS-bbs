import { QueryFailedError } from 'typeorm';

interface PgDriverError {
  code?: string;
  constraint?: string;
}

function driverError(err: unknown): PgDriverError | null {
  return err instanceof QueryFailedError
    ? (err.driverError as PgDriverError)
    : null;
}

/** Postgres 23505 (unique_violation), optionally for one named index/constraint. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const d = driverError(err);
  return d?.code === '23505' && (!constraint || d.constraint === constraint);
}

/** Postgres 23503 (foreign_key_violation): row is still referenced. */
export function isForeignKeyViolation(err: unknown): boolean {
  return driverError(err)?.code === '23503';
}
