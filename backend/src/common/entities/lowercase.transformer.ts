import { ValueTransformer } from 'typeorm';

/**
 * Trims and lowercases a string column on write (emails).
 * Applied by repository save/insert and by `find({ where })`; raw QueryBuilder parameters are
 * NOT transformed, so callers must lowercase those themselves. A CHECK constraint on each email
 * column is the database-level safety net.
 */
export const lowercaseTransformer: ValueTransformer = {
  to: (value: unknown): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  from: (value: unknown): unknown => value,
};
