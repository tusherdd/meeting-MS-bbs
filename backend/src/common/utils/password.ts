/**
 * Password rule and hashing (SPEC.md §9.1). Shared by seeds and (from step 4) auth.
 */
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

export const PASSWORD_MIN_LENGTH = 8;

/**
 * Returns the list of broken rules (empty = acceptable). Messages are Bangla because they are
 * shown to users in later steps.
 */
export function checkPasswordStrength(
  password: string,
  email?: string | null,
): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`পাসওয়ার্ড কমপক্ষে ${PASSWORD_MIN_LENGTH} অক্ষরের হতে হবে।`);
  }
  if (!/[A-Za-z]/.test(password)) {
    problems.push('পাসওয়ার্ডে অন্তত একটি ইংরেজি অক্ষর থাকতে হবে।');
  }
  if (!/[0-9]/.test(password)) {
    problems.push('পাসওয়ার্ডে অন্তত একটি সংখ্যা থাকতে হবে।');
  }
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) {
    problems.push('পাসওয়ার্ড ও ইমেইল একই হতে পারবে না।');
  }
  return problems;
}

/** argon2id hash (library defaults: 64 MiB memory, 3 iterations, parallelism 4). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * Hash of 32 random bytes that are thrown away: nobody can ever log in with it, so the user
 * must use "forgot password" (SPEC.md §11.4).
 */
export function hashUnusablePassword(): Promise<string> {
  return hashPassword(randomBytes(32).toString('base64url'));
}
