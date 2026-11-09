import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { sha256Hex } from '../../common/utils/token';
import { User } from '../users/entities/user.entity';
import {
  LOGIN_DELAY_BASE_MS,
  LOGIN_DELAY_FREE_FAILURES,
  LOGIN_DELAY_MAX_MS,
  UNKNOWN_EMAIL_TRACKING_MAX_ENTRIES,
  UNKNOWN_EMAIL_TRACKING_TTL_MS,
} from './auth.constants';

/**
 * Delay before answering a login attempt, from the consecutive failures BEFORE it:
 * 0–4 → 0 ms, 5 → 2 s, 6 → 4 s, 7 → 8 s, 8 → 16 s, 9+ → 30 s (cap).
 */
export function loginDelayMs(previousFailures: number): number {
  if (previousFailures < LOGIN_DELAY_FREE_FAILURES) return 0;
  const exponent = previousFailures - LOGIN_DELAY_FREE_FAILURES;
  // Cap the exponent first so huge counters cannot overflow to Infinity.
  return Math.min(
    LOGIN_DELAY_BASE_MS * 2 ** Math.min(exponent, 20),
    LOGIN_DELAY_MAX_MS,
  );
}

interface UnknownEmailEntry {
  count: number;
  lastFailureAt: number;
}

/**
 * Consecutive failed-login counter and progressive delay (SPEC.md §9.2). There is NO account
 * lock (owner decision, 2026-11-09).
 *
 * - Existing accounts: counter in users.failedLoginCount; a correct password resets it.
 * - Unknown emails: same counter kept in memory (keyed by SHA-256 of the email, never the
 *   email itself), so their timing matches real accounts and reveals nothing. Entries expire
 *   after 24 h without failures; at most 10 000 are kept. Note: per process — a multi-instance
 *   deployment would need a shared store (e.g. Redis).
 */
@Injectable()
export class LoginAttemptService {
  private readonly unknownEmails = new Map<string, UnknownEmailEntry>();

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** Waits before the attempt is answered (correct or not). */
  async waitBeforeAnswer(previousFailures: number): Promise<void> {
    const ms = loginDelayMs(previousFailures);
    if (ms > 0) await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  /** Adds one failure for an account and returns the new consecutive count. */
  async registerFailure(userId: string): Promise<number> {
    // Atomic increment: parallel wrong attempts cannot "lose" a count.
    const result = await this.users
      .createQueryBuilder()
      .update(User)
      .set({ failedLoginCount: () => '"failedLoginCount" + 1' })
      .where('id = :id', { id: userId })
      .returning(['failedLoginCount'])
      .execute();
    const rows = result.raw as Array<{ failedLoginCount: number }>;
    return Number(rows[0]?.failedLoginCount ?? 0);
  }

  async registerSuccess(userId: string): Promise<void> {
    await this.users.update(userId, {
      failedLoginCount: 0,
      lastLoginAt: new Date(),
    });
  }

  /** Consecutive failures recorded for an email that has no account. */
  unknownEmailFailures(email: string, now = Date.now()): number {
    const key = sha256Hex(email.trim().toLowerCase());
    const entry = this.unknownEmails.get(key);
    if (!entry) return 0;
    if (now - entry.lastFailureAt > UNKNOWN_EMAIL_TRACKING_TTL_MS) {
      this.unknownEmails.delete(key);
      return 0;
    }
    return entry.count;
  }

  /** Adds one failure for an email that has no account; returns the new count. */
  registerUnknownEmailFailure(email: string, now = Date.now()): number {
    const key = sha256Hex(email.trim().toLowerCase());
    const count = this.unknownEmailFailures(email, now) + 1;
    // Re-insert so Map order = least recently failed first (for eviction).
    this.unknownEmails.delete(key);
    this.unknownEmails.set(key, { count, lastFailureAt: now });
    this.evict(now);
    return count;
  }

  private evict(now: number): void {
    for (const [key, entry] of this.unknownEmails) {
      const expired = now - entry.lastFailureAt > UNKNOWN_EMAIL_TRACKING_TTL_MS;
      if (
        !expired &&
        this.unknownEmails.size <= UNKNOWN_EMAIL_TRACKING_MAX_ENTRIES
      )
        break;
      this.unknownEmails.delete(key);
    }
  }
}
