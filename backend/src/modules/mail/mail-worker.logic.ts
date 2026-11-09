/**
 * Pure rules of the mail worker (unit-tested): retry schedule and safe error text.
 */
import { EmailStatus } from './enums/email-status.enum';

/** Wait after the 1st, 2nd, 3rd, 4th failure. The 5th failure is final (SPEC.md §6.5). */
export const RETRY_DELAYS_MINUTES = [1, 5, 15, 60] as const;
export const MAX_ATTEMPTS = 5;
export const BATCH_SIZE = 20;
export const SENT_RETENTION_DAYS = 30;
export const LAST_ERROR_MAX_LENGTH = 300;

export interface FailureOutcome {
  status: EmailStatus.PENDING | EmailStatus.FAILED;
  attempts: number;
  /** When to try again (unchanged for FAILED). */
  nextAttemptAt: Date | null;
}

/** State after one more failed attempt (`attemptsBefore` = attempts already made). */
export function afterFailure(
  attemptsBefore: number,
  now: Date,
): FailureOutcome {
  const attempts = attemptsBefore + 1;
  if (attempts >= MAX_ATTEMPTS) {
    return { status: EmailStatus.FAILED, attempts, nextAttemptAt: null };
  }
  const minutes = RETRY_DELAYS_MINUTES[attempts - 1];
  return {
    status: EmailStatus.PENDING,
    attempts,
    nextAttemptAt: new Date(now.getTime() + minutes * 60_000),
  };
}

/**
 * Short, credential-free error text for email_outbox.lastError. SMTP servers sometimes echo
 * the login name, and auth errors may contain base64 credentials; all known secrets (and
 * their base64 forms) are replaced by ***.
 */
export function safeErrorText(
  err: unknown,
  secrets: readonly string[],
): string {
  const e = err as {
    code?: unknown;
    responseCode?: unknown;
    message?: unknown;
  };
  const parts = [
    typeof e?.code === 'string' ? e.code : null,
    typeof e?.responseCode === 'number' ? String(e.responseCode) : null,
    typeof e?.message === 'string' ? e.message : String(err),
  ].filter((p): p is string => Boolean(p));
  let text = parts.join(' ').replace(/\s+/g, ' ').trim();
  for (const secret of secrets) {
    if (!secret) continue;
    for (const form of [secret, Buffer.from(secret).toString('base64')]) {
      text = text.split(form).join('***');
    }
  }
  return text.slice(0, LAST_ERROR_MAX_LENGTH);
}
