import { In, IsNull, Not, Like, type EntityManager } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { defaultPasswordColumns } from './default-password';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';

/** Test accounts (e.g. the frontend Playwright officers) are never touched. */
export const TEST_ACCOUNT_SUFFIX = '@example.com';

/** argon2 runs on libuv's thread pool (4 threads by default). */
const HASH_CONCURRENCY = 4;

/**
 * OFFICER and ADMIN accounts, except test accounts. The SUPER_ADMIN is excluded by role:
 * it keeps its own password (owner decision 2026-11-09, SPEC.md §6.2).
 */
const TARGET = {
  role: In([UserRole.OFFICER, UserRole.ADMIN]),
  loginEmail: Not(Like(`%${TEST_ACCOUNT_SUFFIX}`)),
};

export interface ApplyDefaultPasswordResult {
  users: number;
  revokedSessions: number;
}

/**
 * One-off data change (npm run users:apply-default-password):
 * every target account gets the default officer password (its own salted hash),
 * passwordIsDefault = true, mustChangePassword = false, failedLoginCount = 0; all their refresh
 * tokens are revoked; one audit log entry with the count. `dryRun` only counts.
 * Run inside one transaction (the caller passes the manager).
 */
export async function applyDefaultPassword(
  manager: EntityManager,
  defaultPassword: string,
  dryRun: boolean,
): Promise<ApplyDefaultPasswordResult> {
  const users = await manager
    .getRepository(User)
    .find({ where: TARGET, select: { id: true } });
  const ids = users.map((u) => u.id);
  const revokedSessions =
    ids.length === 0
      ? 0
      : await manager
          .getRepository(RefreshToken)
          .countBy({ userId: In(ids), revokedAt: IsNull() });
  if (dryRun || ids.length === 0) return { users: ids.length, revokedSessions };

  for (let i = 0; i < ids.length; i += HASH_CONCURRENCY) {
    const batch = ids.slice(i, i + HASH_CONCURRENCY);
    await Promise.all(
      batch.map(async (id) =>
        manager.getRepository(User).update(id, {
          ...(await defaultPasswordColumns(defaultPassword)),
          failedLoginCount: 0,
        }),
      ),
    );
  }
  await manager
    .getRepository(RefreshToken)
    .update(
      { userId: In(ids), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  await manager.getRepository(AuditLog).insert({
    actorId: null,
    action: AuditAction.USERS_DEFAULT_PASSWORD_APPLIED,
    entityType: 'user',
    entityId: null,
    before: null,
    after: { count: ids.length, revokedSessions },
    ip: null,
  });
  return { users: ids.length, revokedSessions };
}
