import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { EnvVars } from '../../config/env.validation';
import { hashPassword } from '../../common/utils/password';
import { sha256Hex } from '../../common/utils/token';
import type { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import {
  ChannelName,
  type NotificationMessage,
} from '../notifications/channels/notification-channel';
import type { NotificationsService } from '../notifications/notifications.service';
import { PasswordTokenPurpose } from './enums/password-token-purpose.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { AUTH_MESSAGES } from './auth.messages';
import { AuthService } from './auth.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import type { LoginAttemptService } from './login-attempt.service';
import type { RequestMeta, TokenPair, TokenService } from './token.service';

const PASSWORD = 'Correct123';
const meta: RequestMeta = { ip: '127.0.0.1', userAgent: 'jest' };
const pair: TokenPair = {
  accessToken: 'access',
  accessExpiresIn: 900,
  refreshToken: 'refresh',
  refreshExpiresIn: 604800,
};

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

function fullUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'u1',
    loginEmail: 'officer@example.test',
    notificationEmail: 'notify@example.test',
    nameBn: 'পরীক্ষা',
    nameEn: 'Test',
    role: UserRole.OFFICER,
    mustChangePassword: false,
    designation: {
      id: 'd1',
      nameBn: 'উপপরিচালক',
      nameEn: 'Deputy Director',
      priority: 6,
    },
    wing: null,
    lastLoginAt: null,
    ...overrides,
  });
}

/** Builds the service with jest mocks for every dependency. */
function setup() {
  const users = { findOne: jest.fn() };
  const tokens = {
    issuePair: jest.fn().mockResolvedValue(pair),
    revokeAllForUser: jest.fn(),
    rotate: jest.fn(),
    revoke: jest.fn(),
  };
  const attempts = {
    waitBeforeAnswer: jest.fn().mockResolvedValue(undefined),
    registerFailure: jest.fn().mockResolvedValue(1),
    registerSuccess: jest.fn(),
    unknownEmailFailures: jest.fn().mockReturnValue(0),
    registerUnknownEmailFailure: jest.fn().mockReturnValue(1),
  };
  const audit = { log: jest.fn() };
  const notifications = { notify: jest.fn() };

  // Repositories used inside transactions.
  const resetQuery = {
    where: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const txUsers = { update: jest.fn(), findOne: jest.fn() };
  const txResetTokens = {
    update: jest.fn(),
    insert: jest.fn(),
    createQueryBuilder: jest.fn(() => resetQuery),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === User
        ? txUsers
        : entity === PasswordResetToken
          ? txResetTokens
          : {},
    ),
  };
  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
      cb(manager as unknown as EntityManager),
    ),
  };
  const env: Partial<EnvVars> = { FRONTEND_URL: 'http://localhost:3000/' };

  const service = new AuthService(
    users as unknown as Repository<User>,
    tokens as unknown as TokenService,
    attempts as unknown as LoginAttemptService,
    audit as unknown as AuditService,
    notifications as unknown as NotificationsService,
    dataSource as unknown as DataSource,
    {
      get: (key: keyof EnvVars) => env[key],
    } as unknown as ConfigService<EnvVars, true>,
  );
  return {
    service,
    users,
    tokens,
    attempts,
    audit,
    notifications,
    dataSource,
    txUsers,
    txResetTokens,
    resetQuery,
  };
}

function auditActions(audit: { log: jest.Mock }): string[] {
  const calls = audit.log.mock.calls as Array<[{ action: string }]>;
  return calls.map(([entry]) => entry.action);
}

describe('AuthService.login', () => {
  const credentials = (overrides: Record<string, unknown> = {}) => ({
    id: 'u1',
    passwordHash,
    isActive: true,
    failedLoginCount: 0,
    ...overrides,
  });
  const loginAs = (service: AuthService, password: string) =>
    service.login({ loginEmail: 'officer@example.test', password }, meta);

  it('every failure has the same message, which suggests "forgot password"', () => {
    expect(AUTH_MESSAGES.invalidCredentials).toContain(
      'পাসওয়ার্ড ভুলে গেছেন?',
    );
  });

  it('unknown email → same 401, counted in memory, audit without the email', async () => {
    const { service, users, attempts, audit, tokens } = setup();
    users.findOne.mockResolvedValue(null);
    attempts.unknownEmailFailures.mockReturnValue(3);
    attempts.registerUnknownEmailFailure.mockReturnValue(4);

    await expect(
      service.login(
        { loginEmail: 'nobody@example.test', password: PASSWORD },
        meta,
      ),
    ).rejects.toThrow(
      new UnauthorizedException(AUTH_MESSAGES.invalidCredentials),
    );
    expect(attempts.waitBeforeAnswer).toHaveBeenCalledWith(3);
    expect(attempts.registerUnknownEmailFailure).toHaveBeenCalledWith(
      'nobody@example.test',
    );
    expect(attempts.registerFailure).not.toHaveBeenCalled();
    expect(tokens.issuePair).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        action: AuditAction.LOGIN_FAILED,
        after: { reason: 'unknown_email', failedCount: 4 },
      }),
    );
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain(
      'nobody@example.test',
    );
  });

  it('wrong password → same 401, counted in the DB and audited', async () => {
    const { service, users, attempts, audit } = setup();
    users.findOne.mockResolvedValue(credentials({ failedLoginCount: 2 }));
    attempts.registerFailure.mockResolvedValue(3);

    await expect(loginAs(service, 'Wrong1234')).rejects.toThrow(
      new UnauthorizedException(AUTH_MESSAGES.invalidCredentials),
    );
    expect(attempts.waitBeforeAnswer).toHaveBeenCalledWith(2);
    expect(attempts.registerFailure).toHaveBeenCalledWith('u1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        after: { reason: 'wrong_password', failedCount: 3 },
      }),
    );
  });

  it('waits BEFORE checking the password, also when the password is correct', async () => {
    const { service, users, attempts, tokens } = setup();
    users.findOne
      .mockResolvedValueOnce(credentials({ failedLoginCount: 7 }))
      .mockResolvedValueOnce(fullUser());
    const order: string[] = [];
    attempts.waitBeforeAnswer.mockImplementation(() => {
      order.push('wait');
      return Promise.resolve();
    });
    attempts.registerSuccess.mockImplementation(() => {
      order.push('success');
      return Promise.resolve();
    });

    await expect(loginAs(service, PASSWORD)).resolves.toMatchObject({ pair });
    expect(attempts.waitBeforeAnswer).toHaveBeenCalledWith(7);
    expect(order).toEqual(['wait', 'success']);
    expect(tokens.issuePair).toHaveBeenCalled();
  });

  it('inactive account → 403 after a correct password, no tokens', async () => {
    const { service, users, tokens } = setup();
    users.findOne.mockResolvedValue(credentials({ isActive: false }));

    await expect(loginAs(service, PASSWORD)).rejects.toThrow(
      new ForbiddenException(AUTH_MESSAGES.accountInactive),
    );
    expect(tokens.issuePair).not.toHaveBeenCalled();
  });

  it('success → resets counter, issues tokens, audits, returns no password hash', async () => {
    const { service, users, attempts, tokens, audit } = setup();
    users.findOne
      .mockResolvedValueOnce(credentials())
      .mockResolvedValueOnce(fullUser());

    const result = await loginAs(service, PASSWORD);
    expect(attempts.registerSuccess).toHaveBeenCalledWith('u1');
    expect(tokens.issuePair).toHaveBeenCalledWith('u1', meta);
    expect(auditActions(audit)).toEqual([AuditAction.LOGIN_SUCCESS]);
    expect(result.user).toMatchObject({
      id: 'u1',
      priority: 6,
      role: UserRole.OFFICER,
    });
    expect(JSON.stringify(result.user)).not.toMatch(/passwordHash|argon2/);
  });
});

describe('AuthService.refresh', () => {
  it('without a refresh cookie → 401', async () => {
    const { service, tokens } = setup();
    await expect(service.refresh(undefined, meta)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokens.rotate).not.toHaveBeenCalled();
  });
});

describe('AuthService.changePassword', () => {
  const stored = () => ({
    id: 'u1',
    loginEmail: 'officer@example.test',
    passwordHash,
  });

  it('wrong current password → 400', async () => {
    const { service, users } = setup();
    users.findOne.mockResolvedValue(stored());
    await expect(
      service.changePassword(
        'u1',
        { currentPassword: 'Nope1234', newPassword: 'NewPass123' },
        meta,
      ),
    ).rejects.toThrow(
      new BadRequestException(AUTH_MESSAGES.wrongCurrentPassword),
    );
  });

  it.each([
    ['too weak', 'short1'],
    ['equal to the email', 'officer@example.test'],
    ['same as the current one', PASSWORD],
  ])('rejects a new password that is %s', async (_label, newPassword) => {
    const { service, users, txUsers } = setup();
    users.findOne.mockResolvedValue(stored());
    await expect(
      service.changePassword(
        'u1',
        { currentPassword: PASSWORD, newPassword },
        meta,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(txUsers.update).not.toHaveBeenCalled();
  });

  it('success → new argon2id hash, clears mustChangePassword, ends other sessions', async () => {
    const { service, users, txUsers, tokens, audit } = setup();
    users.findOne.mockResolvedValue(stored());

    await expect(
      service.changePassword(
        'u1',
        { currentPassword: PASSWORD, newPassword: 'NewPass123' },
        meta,
      ),
    ).resolves.toEqual(pair);

    const [, update] = txUsers.update.mock.calls[0] as [string, Partial<User>];
    expect(update.mustChangePassword).toBe(false);
    expect(update.passwordHash).toMatch(/^\$argon2id\$/);
    expect(update.passwordHash).not.toContain('NewPass123');
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith(
      'u1',
      expect.anything(),
    );
    expect(tokens.issuePair).toHaveBeenCalled();
    expect(auditActions(audit)).toEqual([AuditAction.PASSWORD_CHANGE]);
  });
});

describe('AuthService.forgotPassword', () => {
  it('unknown email → no mail, no error', async () => {
    const { service, users, notifications, dataSource } = setup();
    users.findOne.mockResolvedValue(null);
    await expect(
      service.forgotPassword({ loginEmail: 'nobody@example.test' }, meta),
    ).resolves.toBeUndefined();
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('inactive account → no mail', async () => {
    const { service, users, notifications } = setup();
    users.findOne.mockResolvedValue({ id: 'u1', isActive: false });
    await service.forgotPassword({ loginEmail: 'officer@example.test' }, meta);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('active account → stores only the hash; e-mail-only notification with the raw link', async () => {
    const { service, users, notifications, txResetTokens } = setup();
    users.findOne.mockResolvedValue({ id: 'u1', isActive: true });

    await service.forgotPassword({ loginEmail: 'officer@example.test' }, meta);

    const [userIds, message, channels] = notifications.notify.mock.calls[0] as [
      string[],
      NotificationMessage,
      ChannelName[],
    ];
    expect(userIds).toEqual(['u1']);
    expect(channels).toEqual([ChannelName.EMAIL]); // security mail, no bell item
    const mail = message.email!({
      id: 'u1',
      nameBn: 'পরীক্ষা <b>',
      notificationEmail: 'notify@example.test',
    });
    const match =
      /http:\/\/localhost:3000\/reset-password\?token=([A-Za-z0-9_-]{43})"/.exec(
        mail.html,
      );
    expect(match).not.toBeNull();
    const rawToken = match![1];
    expect(mail.text).toContain(rawToken); // plain-text version has the link too

    const [inserted] = txResetTokens.insert.mock.calls[0] as [
      { tokenHash: string; expiresAt: Date; purpose: PasswordTokenPurpose },
    ];
    expect(inserted.tokenHash).toBe(sha256Hex(rawToken));
    expect(inserted.purpose).toBe(PasswordTokenPurpose.RESET);
    expect(JSON.stringify(inserted)).not.toContain(rawToken);
    const minutes = (inserted.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
    // Older unused links are closed and user text is HTML-escaped.
    expect(txResetTokens.update).toHaveBeenCalled();
    expect(mail.html).toContain('পরীক্ষা &lt;b&gt;');
  });
});

describe('AuthService.resetPassword', () => {
  const validRow = () => ({
    id: 't1',
    purpose: PasswordTokenPurpose.SET_INITIAL,
    userId: 'u1',
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  });

  it.each([
    ['unknown', null],
    ['used', { ...validRow(), usedAt: new Date() }],
    ['expired', { ...validRow(), expiresAt: new Date(Date.now() - 1) }],
  ])('%s token → 400', async (_label, row) => {
    const { service, resetQuery, txUsers } = setup();
    resetQuery.getOne.mockResolvedValue(row);
    await expect(
      service.resetPassword(
        { token: 'x'.repeat(43), newPassword: 'NewPass123' },
        meta,
      ),
    ).rejects.toThrow(new BadRequestException(AUTH_MESSAGES.invalidResetToken));
    expect(txUsers.update).not.toHaveBeenCalled();
  });

  it('weak new password → 400 and nothing is changed', async () => {
    const { service, resetQuery, txUsers } = setup();
    resetQuery.getOne.mockResolvedValue(validRow());
    txUsers.findOne.mockResolvedValue({
      id: 'u1',
      loginEmail: 'o@example.test',
      isActive: true,
    });
    await expect(
      service.resetPassword(
        { token: 'x'.repeat(43), newPassword: 'weak' },
        meta,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(txUsers.update).not.toHaveBeenCalled();
  });

  it('valid token → new password, resets fail counter, marks token used, ends sessions', async () => {
    const { service, resetQuery, txUsers, txResetTokens, tokens, audit } =
      setup();
    resetQuery.getOne.mockResolvedValue(validRow());
    txUsers.findOne.mockResolvedValue({
      id: 'u1',
      loginEmail: 'o@example.test',
      isActive: true,
    });

    await expect(
      service.resetPassword(
        { token: 'x'.repeat(43), newPassword: 'NewPass123' },
        meta,
      ),
    ).resolves.toBe(PasswordTokenPurpose.SET_INITIAL); // the set-password link works too

    expect(resetQuery.where).toHaveBeenCalledWith('t.tokenHash = :tokenHash', {
      tokenHash: sha256Hex('x'.repeat(43)),
    });
    const [, update] = txUsers.update.mock.calls[0] as [string, Partial<User>];
    expect(update).toMatchObject({
      mustChangePassword: false,
      failedLoginCount: 0,
    });
    expect(txResetTokens.update).toHaveBeenCalled();
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith(
      'u1',
      expect.anything(),
    );
    expect(auditActions(audit)).toEqual([AuditAction.PASSWORD_RESET]);
  });
});
