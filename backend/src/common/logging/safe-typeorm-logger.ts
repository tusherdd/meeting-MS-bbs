import { Logger as NestLogger } from '@nestjs/common';
import type { Logger as TypeOrmLogger } from 'typeorm';

/** One-line SQL without bound values, shortened. */
function sqlOnly(query: string): string {
  return query.replace(/\s+/g, ' ').trim().slice(0, 500);
}

/**
 * TypeORM logger that NEVER writes query parameters (step 10, CLAUDE.md): parameters can hold
 * e-mails, phone numbers, password hashes or tokens. Errors log the SQL text, the error code
 * and the constraint name only — not the driver's `detail` ("Key (loginEmail)=(…)").
 * Normal queries are not logged at all.
 */
export class SafeTypeOrmLogger implements TypeOrmLogger {
  private readonly logger = new NestLogger('TypeORM');

  logQuery(): void {
    // intentionally silent
  }

  logQueryError(error: string | Error, query: string): void {
    const e = error as Error & { code?: string; constraint?: string };
    const code =
      typeof e === 'object' && e.code
        ? ` [${e.code}${e.constraint ? ` ${e.constraint}` : ''}]`
        : '';
    const message = typeof error === 'string' ? error : error.message;
    this.logger.error(
      `Query failed${code}: ${message.slice(0, 300)} — SQL: ${sqlOnly(query)}`,
    );
  }

  logQuerySlow(time: number, query: string): void {
    this.logger.warn(`Slow query (${time} ms): ${sqlOnly(query)}`);
  }

  logSchemaBuild(message: string): void {
    this.logger.log(message);
  }

  logMigration(message: string): void {
    this.logger.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    if (level === 'warn') this.logger.warn(String(message));
  }
}
