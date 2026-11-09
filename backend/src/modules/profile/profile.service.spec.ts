import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import { sha256Hex } from '../../common/utils/token';
import type { EnvVars } from '../../config/env.validation';
import type { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import type { MailService } from '../mail/mail.service';
import {
  ChannelName,
  type NotificationMessage,
} from '../notifications/channels/notification-channel';
import type { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import type { AvatarStorageService } from './avatar-storage.service';
import { PROFILE_MESSAGES } from './profile.messages';
import { ProfileService } from './profile.service';

const me: AuthUser = {
  id: 'u1',
  role: UserRole.OFFICER,
  mustChangePassword: false,
};

function stored(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'u1',
    role: UserRole.OFFICER,
    loginEmail: 'login@example.test',
    notificationEmail: 'notify@example.test',
    nameBn: 'অফিসার',
    nameEn: 'Officer',
    mobile: '01711111111',
    wingId: null,
    designation: null,
    wing: null,
    additionalCharges: [],
    photoPath: null,
    ...overrides,
  });
}

function setup() {
  const users = { findOne: jest.fn().mockResolvedValue(stored()) };
  const updateQuery = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ raw: [] }),
  };
  const txUsers = { update: jest.fn() };
  const manager = {
    getRepository: jest.fn(() => txUsers),
    createQueryBuilder: jest.fn(() => updateQuery),
  };
  const wingLookup = {
    findOne: jest.fn().mockResolvedValue({ id: 'w1', isActive: true }),
  };
  const dataSource = {
    getRepository: jest.fn(() => wingLookup),
    transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
      Promise.resolve().then(() => cb(manager as unknown as EntityManager)),
    ),
  };
  const audit = { log: jest.fn() };
  const mail = { enqueue: jest.fn() };
  const notifications = { notify: jest.fn() };
  const avatars = { save: jest.fn(), remove: jest.fn() };
  const env: Partial<EnvVars> = { FRONTEND_URL: 'http://localhost:3000/' };
  const service = new ProfileService(
    users as unknown as Repository<User>,
    avatars as unknown as AvatarStorageService,
    audit as unknown as AuditService,
    mail as unknown as MailService,
    notifications as unknown as NotificationsService,
    dataSource as unknown as DataSource,
    { get: (k: keyof EnvVars) => env[k] } as unknown as ConfigService<
      EnvVars,
      true
    >,
  );
  return {
    service,
    users,
    txUsers,
    updateQuery,
    wingLookup,
    audit,
    mail,
    notifications,
  };
}

describe('ProfileService.update', () => {
  it('audits only the NAMES of changed fields, never phone numbers', async () => {
    const { service, txUsers, audit } = setup();
    await service.update(
      me,
      { mobile: '01999999999', nameEn: 'New Name' },
      null,
    );
    expect(txUsers.update).toHaveBeenCalledWith('u1', {
      mobile: '01999999999',
      nameEn: 'New Name',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PROFILE_UPDATE,
        after: { fields: ['nameEn', 'mobile'] },
      }),
      expect.anything(),
    );
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('01999999999');
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('01711111111');
  });

  it('refuses to clear a required name', async () => {
    const { service } = setup();
    await expect(
      service.update(me, { nameBn: null as unknown as string }, null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only active wings; never a wing for the SUPER_ADMIN', async () => {
    const { service, users, wingLookup } = setup();
    wingLookup.findOne.mockResolvedValue({ id: 'w1', isActive: false });
    await expect(service.update(me, { wingId: 'w1' }, null)).rejects.toThrow(
      new BadRequestException(PROFILE_MESSAGES.wingInactive),
    );
    users.findOne.mockResolvedValue(stored({ role: UserRole.SUPER_ADMIN }));
    await expect(service.update(me, { wingId: 'w1' }, null)).rejects.toThrow(
      new BadRequestException(PROFILE_MESSAGES.superAdminNoWing),
    );
  });

  it('no real change → nothing written', async () => {
    const { service, txUsers, audit } = setup();
    await service.update(
      me,
      { nameEn: 'Officer', mobile: '01711111111' },
      null,
    );
    expect(txUsers.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('ProfileService notification email', () => {
  it('stores only a token hash with 24 h expiry; mails new (link) and old (notice)', async () => {
    const { service, txUsers, mail, notifications } = setup();
    await service.requestNotificationEmailChange(
      me,
      { email: 'fresh@example.test' },
      null,
    );

    const [, update] = txUsers.update.mock.calls[0] as [string, Partial<User>];
    expect(update.pendingNotificationEmail).toBe('fresh@example.test');
    expect(update.notificationEmailTokenHash).toMatch(/^[0-9a-f]{64}$/);
    const hours =
      (update.notificationEmailTokenExpiresAt!.getTime() - Date.now()) /
      3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    // login email is never part of the update
    expect(update).not.toHaveProperty('loginEmail');
    expect(update).not.toHaveProperty('notificationEmail');

    // The new (unverified) address gets the link directly ...
    const [toNew] = (
      mail.enqueue.mock.calls as Array<[{ to: string; html: string }]>
    ).map(([m]) => m);
    expect(mail.enqueue).toHaveBeenCalledTimes(1);
    expect(toNew.to).toBe('fresh@example.test');
    const token = /verify-email\?token=([A-Za-z0-9_-]{43})/.exec(
      toNew.html,
    )![1];
    expect(sha256Hex(token)).toBe(update.notificationEmailTokenHash);
    expect(toNew.html).toContain('http://localhost:3000/verify-email?token=');
    // ... the current verified address gets an e-mail-only notice via notify().
    const [userIds, message, channels] = notifications.notify.mock.calls[0] as [
      string[],
      NotificationMessage,
      ChannelName[],
    ];
    expect(userIds).toEqual(['u1']);
    expect(channels).toEqual([ChannelName.EMAIL]);
    const notice = message.email!({
      id: 'u1',
      nameBn: 'অফিসার',
      notificationEmail: 'notify@example.test',
    });
    expect(notice.html).not.toContain(token);
    expect(notice.html).toContain('fr***@example.test');
  });

  it('refuses the current address', async () => {
    const { service } = setup();
    await expect(
      service.requestNotificationEmailChange(
        me,
        { email: 'notify@example.test' },
        null,
      ),
    ).rejects.toThrow(
      new BadRequestException(PROFILE_MESSAGES.sameNotificationEmail),
    );
  });

  it('verify: matches token hash + expiry in ONE update; no row → 400 (used/expired/wrong)', async () => {
    const { service, updateQuery, audit } = setup();
    await expect(
      service.verifyNotificationEmail('x'.repeat(43), null),
    ).rejects.toThrow(
      new BadRequestException(PROFILE_MESSAGES.invalidVerifyToken),
    );
    expect(updateQuery.where).toHaveBeenCalledWith(
      '"notificationEmailTokenHash" = :tokenHash',
      {
        tokenHash: sha256Hex('x'.repeat(43)),
      },
    );
    expect(updateQuery.andWhere).toHaveBeenCalledWith(
      '"notificationEmailTokenExpiresAt" > now()',
    );
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('verify: success clears the token and audits', async () => {
    const { service, updateQuery, audit } = setup();
    updateQuery.execute.mockResolvedValue({
      raw: [{ id: 'u1', notificationEmail: 'fresh@example.test' }],
    });
    await service.verifyNotificationEmail('x'.repeat(43), null);
    expect(updateQuery.set).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingNotificationEmail: null,
        notificationEmailTokenHash: null,
        notificationEmailTokenExpiresAt: null,
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.NOTIFICATION_EMAIL_VERIFIED,
      }),
      expect.anything(),
    );
  });
});
