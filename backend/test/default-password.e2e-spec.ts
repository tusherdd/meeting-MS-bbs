/**
 * Owner decision 2026-11-09 (SPEC.md §6.2): the one-off apply-default-password command.
 * Runs the core function against the TEST database only (never the CLI against .env).
 */
import * as argon2 from 'argon2';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { DataSource, In, Like } from 'typeorm';
import { hashPassword } from '../src/common/utils/password';
import { validateEnv } from '../src/config/env.validation';
import { buildDataSourceOptions } from '../src/database/typeorm-options';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum';
import { RefreshToken } from '../src/modules/auth/entities/refresh-token.entity';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import {
  TEST_ACCOUNT_SUFFIX,
  applyDefaultPassword,
} from '../src/modules/users/apply-default-password';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';

const DOMAIN = '@e2e-default-password.test';
const OWN_PASSWORD = 'MyOwn12345';
const DEFAULT_PASSWORD = process.env.DEFAULT_OFFICER_PASSWORD ?? '';

type Key = 'officer' | 'admin' | 'superAdmin' | 'testAccount';

describe('users:apply-default-password (e2e)', () => {
  let ds: DataSource;
  let designationId: string;
  const ids = {} as Record<Key, string>;

  const emailOf = (key: Key) =>
    key === 'testAccount'
      ? `e2e-default-password${TEST_ACCOUNT_SUFFIX}`
      : `${key.toLowerCase()}${DOMAIN}`;

  async function cleanup() {
    const users = await ds.getRepository(User).find({
      select: { id: true },
      where: [
        { loginEmail: Like(`%${DOMAIN}`) },
        { loginEmail: emailOf('testAccount') },
      ],
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length > 0) {
      await ds.getRepository(RefreshToken).delete({ userId: In(userIds) });
      await ds.getRepository(User).delete({ id: In(userIds) });
    }
    await ds
      .getRepository(Designation)
      .delete({ nameEn: 'E2E Default Password Designation' });
  }

  beforeAll(async () => {
    ds = new DataSource({
      ...buildDataSourceOptions(validateEnv(process.env)),
      logging: false,
    });
    await ds.initialize();
    await cleanup();
    designationId = (
      await ds.getRepository(Designation).insert({
        nameBn: 'ই২ই ডিফল্ট',
        nameEn: 'E2E Default Password Designation',
        priority: 98,
      })
    ).identifiers[0].id as string;

    const passwordHash = await hashPassword(OWN_PASSWORD);
    const rows: Array<[Key, Partial<User>]> = [
      ['officer', { role: UserRole.OFFICER, failedLoginCount: 3 }],
      ['admin', { role: UserRole.ADMIN }],
      [
        'superAdmin',
        {
          role: UserRole.SUPER_ADMIN,
          designationId: null,
          mustChangePassword: true,
        },
      ],
      ['testAccount', { role: UserRole.OFFICER }],
    ];
    for (const [key, extra] of rows) {
      ids[key] = (
        await ds.getRepository(User).insert({
          loginEmail: emailOf(key),
          notificationEmail: emailOf(key),
          passwordHash,
          nameBn: 'ই২ই ডিফল্ট',
          nameEn: `E2E ${key}`,
          designationId,
          mustChangePassword: false,
          passwordIsDefault: false,
          isActive: true,
          ...extra,
        })
      ).identifiers[0].id as string;
      await ds.getRepository(RefreshToken).insert({
        userId: ids[key],
        tokenHash: `e2e-default-password-${key}`.padEnd(64, '0'),
        expiresAt: new Date(Date.now() + 86_400_000),
      });
    }
  });

  afterAll(async () => {
    await cleanup();
    await ds.destroy();
  });

  /** passwordHash is select:false on the entity; load it explicitly. */
  const load = (key: Key) =>
    ds
      .getRepository(User)
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id: ids[key] })
      .getOneOrFail();

  it('refuses to run without exactly one of --dry-run / --yes (before touching any database)', () => {
    const run = spawnSync(
      process.execPath,
      [
        join(__dirname, '..', 'node_modules', 'ts-node', 'dist', 'bin.js'),
        '--transpile-only',
        join(
          __dirname,
          '..',
          'src',
          'database',
          'commands',
          'apply-default-password.ts',
        ),
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, DB_HOST: 'unreachable.invalid' },
      },
    );
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('--dry-run');
  });

  it('dry run: counts only, changes nothing', async () => {
    const expected = await ds.getRepository(User).countBy({
      role: In([UserRole.OFFICER, UserRole.ADMIN]),
    });
    const result = await ds.transaction((m) =>
      applyDefaultPassword(m, DEFAULT_PASSWORD, true),
    );
    // Every OFFICER/ADMIN except the @example.com test account.
    expect(result.users).toBe(expected - 1);
    expect(result.revokedSessions).toBeGreaterThanOrEqual(2);

    const officer = await load('officer');
    expect(officer.passwordIsDefault).toBe(false);
    expect(await argon2.verify(officer.passwordHash, OWN_PASSWORD)).toBe(true);
    expect(
      await ds.getRepository(AuditLog).countBy({
        action: AuditAction.USERS_DEFAULT_PASSWORD_APPLIED,
      }),
    ).toBe(0);
  });

  it('--yes: officers and admins get the default password; super admin and test accounts are untouched', async () => {
    const result = await ds.transaction((m) =>
      applyDefaultPassword(m, DEFAULT_PASSWORD, false),
    );

    for (const key of ['officer', 'admin'] as const) {
      const user = await load(key);
      expect(user).toMatchObject({
        passwordIsDefault: true,
        mustChangePassword: false,
        failedLoginCount: 0,
      });
      expect(await argon2.verify(user.passwordHash, DEFAULT_PASSWORD)).toBe(
        true,
      );
      const token = await ds
        .getRepository(RefreshToken)
        .findOneByOrFail({ userId: ids[key] });
      expect(token.revokedAt).toBeInstanceOf(Date);
    }
    // Each account has its own salt: equal password, different hashes.
    expect((await load('officer')).passwordHash).not.toBe(
      (await load('admin')).passwordHash,
    );

    for (const key of ['superAdmin', 'testAccount'] as const) {
      const user = await load(key);
      expect(user.passwordIsDefault).toBe(false);
      expect(await argon2.verify(user.passwordHash, OWN_PASSWORD)).toBe(true);
      const token = await ds
        .getRepository(RefreshToken)
        .findOneByOrFail({ userId: ids[key] });
      expect(token.revokedAt).toBeNull();
    }
    expect((await load('superAdmin')).mustChangePassword).toBe(true);

    const audit = await ds.getRepository(AuditLog).find({
      where: { action: AuditAction.USERS_DEFAULT_PASSWORD_APPLIED },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].after).toEqual({
      count: result.users,
      revokedSessions: result.revokedSessions,
    });
    expect(JSON.stringify(audit)).not.toContain(DEFAULT_PASSWORD);
    await ds.getRepository(AuditLog).delete({ id: audit[0].id });
  });
});
