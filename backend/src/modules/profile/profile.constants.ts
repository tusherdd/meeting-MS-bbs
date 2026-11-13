import { hours } from '@nestjs/throttler';

/** SPEC.md §6.2: notification email verification links live 24 hours. */
export const NOTIFICATION_EMAIL_TOKEN_TTL_HOURS = 24;

/** Per-user limits (logged-in routes are counted per user): these routes send mail or write files. */
export const PROFILE_THROTTLE = {
  photo: { default: { limit: 20, ttl: hours(1) } },
  notificationEmail: { default: { limit: 5, ttl: hours(1) } },
  changeRequest: { default: { limit: 10, ttl: hours(1) } },
} as const;
