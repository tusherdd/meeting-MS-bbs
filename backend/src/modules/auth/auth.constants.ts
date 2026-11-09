import { minutes } from '@nestjs/throttler';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
/** Refresh cookie is only sent to auth routes (SPEC.md §9.4). */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * SPEC.md §9.2 — no account lock; a progressive delay instead. After this many consecutive
 * failures, each further attempt waits 2s, 4s, 8s ... (capped) before it is answered.
 */
export const LOGIN_DELAY_FREE_FAILURES = 5;
export const LOGIN_DELAY_BASE_MS = 2_000;
export const LOGIN_DELAY_MAX_MS = 30_000;

/** In-memory failure counter for emails that have no account (see LoginAttemptService). */
export const UNKNOWN_EMAIL_TRACKING_TTL_MS = 24 * 60 * 60_000;
export const UNKNOWN_EMAIL_TRACKING_MAX_ENTRIES = 10_000;

/** SPEC.md §9.12: "forgot password" links live 30 minutes. */
export const RESET_TOKEN_TTL_MINUTES = 30;

/**
 * Stricter per-IP limits for sensitive routes (global default: 100/min).
 * Together with the progressive login delay this slows brute force. Note: officers behind one
 * office NAT share an IP, so the limit is shared by everyone in the office.
 */
export const AUTH_THROTTLE = {
  login: { default: { limit: 10, ttl: minutes(1) } },
  forgotPassword: { default: { limit: 5, ttl: minutes(15) } },
  resetPassword: { default: { limit: 10, ttl: minutes(15) } },
  changePassword: { default: { limit: 10, ttl: minutes(15) } },
} as const;
