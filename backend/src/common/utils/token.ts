/**
 * Helpers for secret tokens in links and cookies (SPEC.md §9.3, §9.12).
 * Only hashes are ever stored; raw tokens exist only in the response / the mail.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 random bytes, URL-safe (43 chars). */
export function generateSecureToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex (64 chars). Fine for high-entropy tokens; passwords use argon2id instead. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex hashes. */
export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
