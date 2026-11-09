import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import { sha256Hex } from '../../common/utils/token';
import type { EnvVars } from '../../config/env.validation';
import type { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import type { TokenService } from '../auth/token.service';
import { PasswordTokenPurpose } from '../auth/enums/password-token-purpose.enum';
import {
  ChannelName,
  type NotificationMessage,
} from '../notifications/channels/notification-channel';
import type { NotificationsService } from '../notifications/notifications.service';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { USER_MESSAGES } from './users.messages';
import { UsersService, type ActionContext } from './users.service';

const admin: AuthUser = {
  id: 'admin',
  role: UserRole.ADMIN,
  mustChangePassword: false,
};
const ctx: ActionContext = { actor: admin, ip: '127.0.0.1' };

function user(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'u1',
    loginEmail: 'officer@example.test',
    notificationEmail: 'notify@example.test',
    nameBn: 'পরীক্ষা',
    nameEn: 'Test',
    role: UserRole.OFFICER,
    isActive: true,
    mustChangePassword: false,
    designationId: 'd1',
    designation: {
      id: 'd1',
      nameBn: 'উপপরিচালক',
      nameEn: 'Deputy Director',
      priority: 6,
    },
    wingId: null,
    wing: null,
    additionalCharges: [],
    failedLoginCount: 0,
    ...overrides,
  });
}

function setup() {
  const users = {
    findOne: jest.fn().mockResolvedValue(user()),
    exists: jest.fn().mockResolvedValue(false),
  };
  const tokens = { revokeAllForUser: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { notify: jest.fn() };
  const txUsers = {
    insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 'new-user' }] }),
    update: jest.fn(),
  };
  const txOther = { insert: jest.fn(), delete: jest.fn(), update: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === User ? txUsers : txOther,
    ),
  };
  const lookup = {
    findOne: jest.fn().mockResolvedValue({ id: 'x', isActive: true }),
  };
  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
      Promise.resolve(cb(manager as unknown as EntityManager)),
    ),
    getRepository: jest.fn(() => lookup),
  };
  const env: Partial<EnvVars> = { FRONTEND_URL: 'http://localhost:3000' };
  const service = new UsersService(
    users as unknown as Repository<User>,
    tokens as unknown as TokenService,
    audit as unknown as AuditService,
    notifications as unknown as NotificationsService,
    dataSource as unknown as DataSource,
    { get: (key: keyof EnvVars) => env[key] } as unknown as ConfigService<
      EnvVars,
      true
    >,
  );
  return {
    service,
    users,
    tokens,
    audit,
    notifications,
    txUsers,
    txOther,
    lookup,
  };
}

/** The e-mail the user would get, rendered for a test recipient. */
function sentMail(notifications: { notify: jest.Mock }) {
  const [userIds, message, channels] = notifications.notify.mock.calls[0] as [
    string[],
    NotificationMessage,
    ChannelName[],
  ];
  const mail = message.email!({
    id: userIds[0],
    nameBn: 'প্রাপক',
    notificationEmail: 'n@x.test',
  });
  return { userIds, channels, mail };
}

describe('UsersService.create', () => {
  const dto = {
    loginEmail: 'new.officer@example.test',
    nameBn: 'নতুন কর্মকর্তা',
    nameEn: 'New Officer',
    designationId: 'd1',
    additionalCharges: ['এসডিজি সেল'],
  };

  it('no password is chosen or mailed: unusable hash + one-time SET_INITIAL link (72 h)', async () => {
    const { service, txUsers, txOther, notifications, audit } = setup();
    const result = await service.create(dto, ctx);

    const [inserted] = txUsers.insert.mock.calls[0] as [Partial<User>];
    expect(inserted.passwordHash).toMatch(/^\$argon2id\$/);
    expect(inserted).toMatchObject({
      mustChangePassword: true,
      role: UserRole.OFFICER,
      notificationEmail: dto.loginEmail, // defaults to loginEmail
    });

    const { userIds, channels, mail } = sentMail(notifications);
    expect(userIds).toEqual(['new-user']);
    expect(channels).toEqual([ChannelName.EMAIL]);
    const token = /set-password\?token=([A-Za-z0-9_-]{43})/.exec(
      mail.html,
    )?.[1];
    expect(token).toBeDefined();
    expect(mail.html).toContain(dto.loginEmail);
    expect(mail.html).not.toMatch(/পাসওয়ার্ড:|password:/i);

    const [tokenRow] = (
      txOther.insert.mock.calls as Array<[{ purpose?: string }]>
    ).find(([row]) => row.purpose !== undefined) as unknown as [
      { purpose: PasswordTokenPurpose; tokenHash: string; expiresAt: Date },
    ];
    expect(tokenRow.purpose).toBe(PasswordTokenPurpose.SET_INITIAL);
    expect(tokenRow.tokenHash).toBe(sha256Hex(token!));
    const hours = (tokenRow.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(71.9);
    expect(hours).toBeLessThanOrEqual(72);

    expect(JSON.stringify(result)).not.toMatch(
      /"password"|passwordHash|"token"|tokenHash/,
    );
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain(token);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.USER_CREATE,
        actorId: 'admin',
      }),
      expect.anything(),
    );
  });

  it('rejects a login email that already exists (409)', async () => {
    const { service, users, txUsers } = setup();
    users.exists.mockResolvedValue(true);
    await expect(service.create(dto, ctx)).rejects.toThrow(
      new ConflictException(USER_MESSAGES.duplicateLoginEmail),
    );
    expect(txUsers.insert).not.toHaveBeenCalled();
  });

  it('rejects an inactive designation (400)', async () => {
    const { service, lookup } = setup();
    lookup.findOne.mockResolvedValue({ id: 'd1', isActive: false });
    await expect(service.create(dto, ctx)).rejects.toThrow(
      new BadRequestException(USER_MESSAGES.designationInactive),
    );
  });
});

describe('UsersService.update', () => {
  it('refuses null for required fields', async () => {
    const { service } = setup();
    await expect(
      service.update('u1', { nameBn: null as unknown as string }, ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes loginEmail after a uniqueness check and audits old/new', async () => {
    const { service, users, txUsers, audit } = setup();
    await service.update('u1', { loginEmail: 'changed@example.test' }, ctx);
    expect(users.exists).toHaveBeenCalled();
    expect(txUsers.update).toHaveBeenCalledWith('u1', {
      loginEmail: 'changed@example.test',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.USER_UPDATE,
        before: { loginEmail: 'officer@example.test' },
        after: { loginEmail: 'changed@example.test' },
      }),
      expect.anything(),
    );
  });

  it('an ADMIN cannot edit the SUPER_ADMIN (403)', async () => {
    const { service, users, txUsers } = setup();
    users.findOne.mockResolvedValue(
      user({
        id: 'sa',
        role: UserRole.SUPER_ADMIN,
        designationId: null,
        designation: null,
      }),
    );
    await expect(
      service.update('sa', { nameEn: 'Hacked' }, ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(txUsers.update).not.toHaveBeenCalled();
  });

  it('the SUPER_ADMIN may edit themselves but never get a designation', async () => {
    const { service, users } = setup();
    const superAdmin: AuthUser = {
      id: 'sa',
      role: UserRole.SUPER_ADMIN,
      mustChangePassword: false,
    };
    users.findOne.mockResolvedValue(
      user({
        id: 'sa',
        role: UserRole.SUPER_ADMIN,
        designationId: null,
        designation: null,
      }),
    );
    await expect(
      service.update(
        'sa',
        { nameEn: 'Admin' },
        { actor: superAdmin, ip: null },
      ),
    ).resolves.toBeDefined();
    await expect(
      service.update(
        'sa',
        { designationId: 'd1' },
        { actor: superAdmin, ip: null },
      ),
    ).rejects.toThrow(
      new BadRequestException(USER_MESSAGES.superAdminNoDesignation),
    );
  });

  it('replaces additional charges and audits the list change', async () => {
    const { service, txOther, audit } = setup();
    await service.update('u1', { additionalCharges: ['এসডিজি সেল'] }, ctx);
    expect(txOther.delete).toHaveBeenCalledWith({ userId: 'u1' });
    expect(txOther.insert).toHaveBeenCalledWith([
      { userId: 'u1', description: 'এসডিজি সেল' },
    ]);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        before: { additionalCharges: [] },
        after: { additionalCharges: ['এসডিজি সেল'] },
      }),
      expect.anything(),
    );
  });
});

describe('UsersService.setStatus / setRole / resetPassword', () => {
  it('deactivation revokes all refresh tokens and is audited', async () => {
    const { service, tokens, txUsers, audit } = setup();
    await service.setStatus('u1', { isActive: false }, ctx);
    expect(txUsers.update).toHaveBeenCalledWith('u1', { isActive: false });
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith(
      'u1',
      expect.anything(),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.USER_STATUS_CHANGE,
        before: { isActive: true },
        after: { isActive: false },
      }),
      expect.anything(),
    );
  });

  it('activation does not revoke anything', async () => {
    const { service, users, tokens } = setup();
    users.findOne.mockResolvedValue(user({ isActive: false }));
    await service.setStatus('u1', { isActive: true }, ctx);
    expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('an admin cannot deactivate or demote themselves', async () => {
    const { service, users } = setup();
    users.findOne.mockResolvedValue(
      user({ id: 'admin', role: UserRole.ADMIN }),
    );
    await expect(
      service.setStatus('admin', { isActive: false }, ctx),
    ).rejects.toThrow(new ForbiddenException(USER_MESSAGES.selfDeactivate));
    await expect(
      service.setRole('admin', { role: UserRole.OFFICER }, ctx),
    ).rejects.toThrow(new ForbiddenException(USER_MESSAGES.selfRoleChange));
  });

  it('promotes an officer to ADMIN and audits it', async () => {
    const { service, txUsers, audit } = setup();
    await service.setRole('u1', { role: UserRole.ADMIN }, ctx);
    expect(txUsers.update).toHaveBeenCalledWith('u1', { role: UserRole.ADMIN });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.USER_ROLE_CHANGE,
        before: { role: UserRole.OFFICER },
        after: { role: UserRole.ADMIN },
      }),
      expect.anything(),
    );
  });

  it('admin reset: old password unusable, sessions ended, one-time RESET link mailed', async () => {
    const { service, txUsers, txOther, tokens, notifications, audit } = setup();
    await service.resetPassword('u1', ctx);

    const [, update] = txUsers.update.mock.calls[0] as [string, Partial<User>];
    expect(update.passwordHash).toMatch(/^\$argon2id\$/);
    expect(update.mustChangePassword).toBe(true);
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith(
      'u1',
      expect.anything(),
    );
    expect(txOther.update).toHaveBeenCalled(); // older links closed

    const { userIds, channels, mail } = sentMail(notifications);
    expect(userIds).toEqual(['u1']);
    expect(channels).toEqual([ChannelName.EMAIL]);
    expect(mail.html).toMatch(/reset-password\?token=[A-Za-z0-9_-]{43}/);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.USER_PASSWORD_RESET_BY_ADMIN,
      }),
      expect.anything(),
    );
  });

  it('refuses to reset an inactive account', async () => {
    const { service, users, notifications } = setup();
    users.findOne.mockResolvedValue(user({ isActive: false }));
    await expect(service.resetPassword('u1', ctx)).rejects.toThrow(
      new BadRequestException(USER_MESSAGES.resetInactive),
    );
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
