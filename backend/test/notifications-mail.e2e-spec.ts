/**
 * Step 7 e2e: notifications API (ownership, unread, read-all), the mail worker against the real
 * database (purge after sending, SKIP LOCKED) and the admin email-outbox routes.
 * Fixtures: domain @e2e-notify.test; everything is removed afterwards.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In, Like } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/common/utils/password';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { EmailOutbox } from '../src/modules/mail/entities/email-outbox.entity';
import { EmailStatus } from '../src/modules/mail/enums/email-status.enum';
import { MailWorkerService } from '../src/modules/mail/mail-worker.service';
import { MailService } from '../src/modules/mail/mail.service';
import { ChannelName } from '../src/modules/notifications/channels/notification-channel';
import { NotificationType } from '../src/modules/notifications/enums/notification-type.enum';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';

const API = '/api/v1';
const DOMAIN = '@e2e-notify.test';
const PASSWORD = 'E2ePass1234';

type Fixture = 'alice' | 'bob' | 'admin' | 'inactive';
const email = (name: string) => `${name}${DOMAIN}`;

interface Page<T> {
  items: T[];
  total: number;
}
interface NotificationItem {
  id: string;
  title: string;
  readAt: string | null;
}

describe('Notifications, mail worker, email outbox (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let notifications: NotificationsService;
  const ids = {} as Record<Fixture, string>;
  const tokens = {} as Record<'alice' | 'bob' | 'admin', string>;

  const http = () => request(app.getHttpServer());

  /**
   * Runs the worker until nothing is due any more (other suites may have queued many mails;
   * one batch takes at most 20, like one cron minute).
   */
  async function drainOutbox(): Promise<void> {
    for (let i = 0; i < 100; i++) {
      const r = await app.get(MailWorkerService).processBatch();
      if (r.sent + r.retried + r.failed === 0) return;
    }
    throw new Error('outbox did not drain');
  }
  const as = (who: 'alice' | 'bob' | 'admin') => ({
    Authorization: `Bearer ${tokens[who]}`,
  });

  async function cleanup(): Promise<void> {
    const users = await ds.getRepository(User).find({
      select: { id: true },
      where: { loginEmail: Like(`%${DOMAIN}`) },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length > 0) {
      await ds.getRepository(AuditLog).delete({ actorId: In(userIds) });
      await ds.getRepository(User).delete({ id: In(userIds) }); // notifications CASCADE
    }
    await ds.getRepository(EmailOutbox).delete({ to: Like(`%${DOMAIN}`) });
    await ds.getRepository(Designation).delete({ nameEn: 'E2EN Designation' });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    notifications = app.get(NotificationsService);
    await cleanup();

    const designationId = (
      await ds
        .getRepository(Designation)
        .insert({ nameBn: 'ই২ইএন', nameEn: 'E2EN Designation', priority: 99 })
    ).identifiers[0].id as string;
    const passwordHash = await hashPassword(PASSWORD);
    for (const [name, role, isActive] of [
      ['alice', UserRole.OFFICER, true],
      ['bob', UserRole.OFFICER, true],
      ['admin', UserRole.ADMIN, true],
      ['inactive', UserRole.OFFICER, false],
    ] as const) {
      ids[name] = (
        await ds.getRepository(User).insert({
          loginEmail: email(name),
          notificationEmail: email(name),
          passwordHash,
          nameBn: `ই২ইএন ${name}`,
          nameEn: `E2EN ${name}`,
          designationId,
          role,
          isActive,
          mustChangePassword: false,
        })
      ).identifiers[0].id as string;
    }
    for (const name of ['alice', 'bob', 'admin'] as const) {
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ loginEmail: email(name), password: PASSWORD });
      tokens[name] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  // ------------------------------------------------------------------ notifications API

  describe('notifications API', () => {
    beforeAll(async () => {
      for (const n of [1, 2, 3]) {
        await notifications.notify(
          [ids.alice],
          {
            type: NotificationType.CHANGE_REQUEST_APPROVED,
            title: `alice-${n}`,
            body: 'b',
          },
          [ChannelName.IN_APP],
        );
      }
      await notifications.notify(
        [ids.bob, ids.inactive],
        {
          type: NotificationType.CHANGE_REQUEST_REJECTED,
          title: 'bob-1',
          body: 'b',
        },
        [ChannelName.IN_APP],
      );
    });

    it('lists only my own notifications, newest first; inactive users get none', async () => {
      const res = await http()
        .get(`${API}/notifications`)
        .set(as('alice'))
        .expect(200);
      const page = res.body as Page<NotificationItem>;
      expect(page.total).toBe(3);
      expect(page.items.map((n) => n.title)).toEqual([
        'alice-3',
        'alice-2',
        'alice-1',
      ]);

      const bob = (
        await http().get(`${API}/notifications`).set(as('bob')).expect(200)
      ).body as Page<NotificationItem>;
      expect(bob.items.map((n) => n.title)).toEqual(['bob-1']);
      expect(
        await ds
          .getRepository('notifications')
          .countBy({ userId: ids.inactive }),
      ).toBe(0);
    });

    it("cannot mark someone else's notification read (404), can mark my own", async () => {
      const bobs = (await http().get(`${API}/notifications`).set(as('bob')))
        .body as Page<NotificationItem>;
      const res = await http()
        .patch(`${API}/notifications/${bobs.items[0].id}/read`)
        .set(as('alice'))
        .expect(404);
      expect((res.body as { message: string }).message).toBe(
        'নোটিফিকেশনটি পাওয়া যায়নি।',
      );

      const mine = (await http().get(`${API}/notifications`).set(as('alice')))
        .body as Page<NotificationItem>;
      const read = await http()
        .patch(`${API}/notifications/${mine.items[0].id}/read`)
        .set(as('alice'))
        .expect(200);
      expect((read.body as NotificationItem).readAt).not.toBeNull();
    });

    it('unread filter and unread count', async () => {
      const unread = (
        await http()
          .get(`${API}/notifications`)
          .query({ unread: true })
          .set(as('alice'))
      ).body as Page<NotificationItem>;
      expect(unread.total).toBe(2);
      expect(unread.items.every((n) => n.readAt === null)).toBe(true);
      const count = await http()
        .get(`${API}/notifications/unread-count`)
        .set(as('alice'));
      expect(count.body).toEqual({ count: 2 });
    });

    it('read-all marks only MY notifications read', async () => {
      const res = await http()
        .patch(`${API}/notifications/read-all`)
        .set(as('alice'))
        .expect(200);
      expect(res.body).toEqual({ updated: 2 });
      expect(
        (await http().get(`${API}/notifications/unread-count`).set(as('alice')))
          .body,
      ).toEqual({ count: 0 });
      expect(
        (await http().get(`${API}/notifications/unread-count`).set(as('bob')))
          .body,
      ).toEqual({
        count: 1,
      });
    });

    it('requires login', async () => {
      await http().get(`${API}/notifications`).expect(401);
    });
  });

  // ------------------------------------------------------------------ worker

  describe('mail worker (MAIL_DRY_RUN=true from .env)', () => {
    it('sends due mail, marks it SENT and deletes the body', async () => {
      const id = await app.get(MailService).enqueue({
        to: email('alice'),
        subject: 'ই২ই পরীক্ষা মেইল',
        html: '<p>one-time link</p>',
        text: 'one-time link',
      });
      await drainOutbox();
      const row = await ds.getRepository(EmailOutbox).findOneByOrFail({ id });
      expect(row).toMatchObject({
        status: EmailStatus.SENT,
        html: null,
        text: null,
        attempts: 1,
        lastError: null,
        to: email('alice'),
        subject: 'ই২ই পরীক্ষা মেইল',
      });
      expect(row.sentAt).toBeInstanceOf(Date);
    });

    it('skips a mail another worker has locked (FOR UPDATE SKIP LOCKED), sends it later', async () => {
      const id = await app.get(MailService).enqueue({
        to: email('bob'),
        subject: 'ই২ই লক পরীক্ষা',
        html: '<p>x</p>',
        text: 'x',
      });
      const other = ds.createQueryRunner(); // plays "the other worker"
      await other.connect();
      await other.startTransaction();
      try {
        await other.query(
          'SELECT id FROM email_outbox WHERE id = $1 FOR UPDATE',
          [id],
        );
        await drainOutbox();
        expect(
          (await ds.getRepository(EmailOutbox).findOneByOrFail({ id })).status,
        ).toBe(EmailStatus.PENDING);
      } finally {
        await other.rollbackTransaction();
        await other.release();
      }
      await drainOutbox();
      expect(
        (await ds.getRepository(EmailOutbox).findOneByOrFail({ id })).status,
      ).toBe(EmailStatus.SENT);
    });

    it('does not send mail whose next attempt is in the future', async () => {
      const id = await app.get(MailService).enqueue({
        to: email('bob'),
        subject: 'ই২ই ভবিষ্যৎ',
        html: '<p>x</p>',
        text: 'x',
      });
      await ds
        .getRepository(EmailOutbox)
        .update(id, { nextAttemptAt: new Date(Date.now() + 10 * 60_000) });
      await drainOutbox();
      expect(
        (await ds.getRepository(EmailOutbox).findOneByOrFail({ id })).status,
      ).toBe(EmailStatus.PENDING);
    });
  });

  // ------------------------------------------------------------------ admin outbox

  describe('admin email outbox', () => {
    let failedId: string;

    beforeAll(async () => {
      failedId = (
        await ds.getRepository(EmailOutbox).insert({
          to: email('failed'),
          subject: 'ই২ই ব্যর্থ মেইল',
          html: '<p>secret one-time link</p>',
          text: 'secret one-time link',
          status: EmailStatus.FAILED,
          attempts: 5,
          lastError: 'ECONNECTION Connection timeout',
        })
      ).identifiers[0].id as string;
    });

    it('officers get 403', async () => {
      await http()
        .get(`${API}/admin/email-outbox`)
        .set(as('alice'))
        .expect(403);
      await http()
        .post(`${API}/admin/email-outbox/${failedId}/retry`)
        .set(as('alice'))
        .expect(403);
    });

    it('lists with status filter and NEVER returns the mail body', async () => {
      const res = await http()
        .get(`${API}/admin/email-outbox`)
        .query({ status: 'FAILED', limit: 100 })
        .set(as('admin'))
        .expect(200);
      const page = res.body as Page<Record<string, unknown>>;
      const item = page.items.find((i) => i.id === failedId)!;
      expect(item).toMatchObject({
        to: email('failed'),
        status: 'FAILED',
        attempts: 5,
        lastError: 'ECONNECTION Connection timeout',
      });
      expect(Object.keys(item).sort()).toEqual(
        [
          'attempts',
          'createdAt',
          'id',
          'lastError',
          'nextAttemptAt',
          'sentAt',
          'status',
          'subject',
          'to',
          'updatedAt',
        ].sort(),
      );
      expect(JSON.stringify(page)).not.toContain('secret one-time link');
      expect(page.items.every((i) => i.status === 'FAILED')).toBe(true);
    });

    it('retry: FAILED → PENDING with 0 attempts (audited); then the worker sends it', async () => {
      const res = await http()
        .post(`${API}/admin/email-outbox/${failedId}/retry`)
        .set(as('admin'))
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'PENDING',
        attempts: 0,
        lastError: null,
      });
      expect(JSON.stringify(res.body)).not.toContain('secret');

      const audit = await ds.getRepository(AuditLog).findOneByOrFail({
        action: AuditAction.EMAIL_RETRY,
        entityId: failedId,
      });
      expect(audit.actorId).toBe(ids.admin);

      await drainOutbox();
      const row = await ds
        .getRepository(EmailOutbox)
        .findOneByOrFail({ id: failedId });
      expect(row).toMatchObject({ status: EmailStatus.SENT, html: null });
    });

    it('only FAILED mail can be retried (409); unknown id → 404', async () => {
      const res = await http()
        .post(`${API}/admin/email-outbox/${failedId}/retry`)
        .set(as('admin'))
        .expect(409);
      expect((res.body as { message: string }).message).toBe(
        'শুধু ব্যর্থ (FAILED) মেইল আবার পাঠানো যায়।',
      );
      await http()
        .post(
          `${API}/admin/email-outbox/3f1c2a9e-1111-4222-8333-444455556666/retry`,
        )
        .set(as('admin'))
        .expect(404);
    });
  });
});
