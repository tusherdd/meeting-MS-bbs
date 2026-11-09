import { IsNull, type EntityManager } from 'typeorm';
import { generateSecureToken, sha256Hex } from '../../common/utils/token';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { PasswordTokenPurpose } from './enums/password-token-purpose.enum';

/**
 * Issues a one-time password token (SPEC.md §9.12): 32 random bytes, only the SHA-256 hash is
 * stored. Older unused tokens of the user are closed first, so only the newest link works.
 * Returns the RAW token — it goes into the mail link and nowhere else.
 */
export async function issuePasswordToken(
  manager: EntityManager,
  userId: string,
  purpose: PasswordTokenPurpose,
  validForMs: number,
): Promise<string> {
  const repo = manager.getRepository(PasswordResetToken);
  await closeOpenPasswordTokens(manager, userId);
  const rawToken = generateSecureToken();
  await repo.insert({
    userId,
    purpose,
    tokenHash: sha256Hex(rawToken),
    expiresAt: new Date(Date.now() + validForMs),
  });
  return rawToken;
}

/** Closes every unused password link of the user (e.g. after an admin reset). */
export async function closeOpenPasswordTokens(
  manager: EntityManager,
  userId: string,
): Promise<void> {
  await manager
    .getRepository(PasswordResetToken)
    .update({ userId, usedAt: IsNull() }, { usedAt: new Date() });
}
