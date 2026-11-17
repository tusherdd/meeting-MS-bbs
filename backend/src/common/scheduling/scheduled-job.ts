import type { LoggerService } from '@nestjs/common';

/** Node socket errors that mean "the database is (temporarily) not reachable". */
const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
]);

/**
 * PostgreSQL SQLSTATEs for a temporary server condition: class 08 (connection exception) is
 * matched by prefix; 53300 too_many_connections, 57P01 admin_shutdown, 57P02 crash_shutdown,
 * 57P03 cannot_connect_now (server starting up or in recovery).
 */
const PG_TRANSIENT_CODES = new Set(['53300', '57P01', '57P02', '57P03']);

/** node-postgres pool / client messages that carry no error code. */
const TRANSIENT_MESSAGE =
  /connection terminated|timeout exceeded when trying to connect|connection timeout|terminating connection|connection error|the database system is (starting up|shutting down)|Connection refused/i;

const MAX_TEXT_LENGTH = 200;

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  driverError?: unknown;
  cause?: unknown;
}

/**
 * True when `err` is a temporary database connection problem (pool timeout, server restart,
 * network drop) rather than a bug or a bad query. TypeORM wraps driver errors in
 * `QueryFailedError.driverError`, and Node can chain them in `cause`, so those are checked too.
 */
export function isTransientDbError(err: unknown, depth = 0): boolean {
  if (!err || typeof err !== 'object' || depth > 3) return false;
  const e = err as ErrorLike;
  if (typeof e.code === 'string') {
    if (NETWORK_CODES.has(e.code) || PG_TRANSIENT_CODES.has(e.code)) {
      return true;
    }
    if (/^08[0-9A-Z]{3}$/.test(e.code)) return true;
  }
  if (typeof e.message === 'string' && TRANSIENT_MESSAGE.test(e.message)) {
    return true;
  }
  return (
    isTransientDbError(e.driverError, depth + 1) ||
    isTransientDbError(e.cause, depth + 1)
  );
}

/** One line, no stack trace, limited length. */
export function shortErrorText(err: unknown): string {
  const e = err as ErrorLike | null;
  const code = typeof e?.code === 'string' ? `${e.code} ` : '';
  const message = typeof e?.message === 'string' ? e.message : String(err);
  return `${code}${message}`
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

export interface ScheduledJobOptions {
  /** Error text for the log; e.g. the mail worker removes SMTP credentials. */
  describeError?: (err: unknown) => string;
}

/**
 * Runs one scheduled job (cron tick) safely:
 * - never throws, so a failing job can never crash the app or stop other jobs;
 * - a tick is skipped while the previous run of the SAME job is still busy (no pile-up when
 *   the database is slow); other jobs are not affected;
 * - a temporary database connection error is logged ONCE as a short WARN; while the outage
 *   lasts later ticks stay quiet, and the next successful run logs one "reachable again" line.
 *   The work is simply retried on the next tick;
 * - any other error is logged as one ERROR line (no stack trace, no request data).
 */
export class ScheduledJob {
  private running = false;
  private dbUnavailable = false;
  private readonly describe: (err: unknown) => string;

  constructor(
    private readonly name: string,
    private readonly logger: Pick<LoggerService, 'log' | 'warn' | 'error'>,
    options: ScheduledJobOptions = {},
  ) {
    this.describe = options.describeError ?? shortErrorText;
  }

  /** Whether the last run failed because the database was not reachable. */
  get waitingForDatabase(): boolean {
    return this.dbUnavailable;
  }

  /** Runs `work` unless the previous run is still busy. Resolves true when it ran successfully. */
  async run(work: () => Promise<unknown>): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      await work();
      if (this.dbUnavailable) {
        this.dbUnavailable = false;
        this.logger.log(`${this.name}: database reachable again`);
      }
      return true;
    } catch (err) {
      if (isTransientDbError(err)) {
        if (!this.dbUnavailable) {
          this.dbUnavailable = true;
          this.logger.warn(
            `${this.name}: database not reachable (${this.describe(err)}); retrying on the next run`,
          );
        }
      } else {
        this.logger.error(`${this.name} failed: ${this.describe(err)}`);
      }
      return false;
    } finally {
      this.running = false;
    }
  }
}
