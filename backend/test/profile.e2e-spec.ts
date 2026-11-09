/**
 * Step 6 e2e: profile, photo upload, notification email and change requests.
 * Fixtures: domain @e2e-profile.test, name prefix "E2EP". Everything created — including
 * notifications/mails sent to real admins about test requests and uploaded files — is removed.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In, IsNull, Like, Not } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/common/utils/password';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum';
import { RefreshToken } from '../src/modules/auth/entities/refresh-token.entity';
import { CHANGE_REQUEST_MESSAGES } from '../src/modules/change-requests/change-requests.messages';
import { ChangeRequest } from '../src/modules/change-requests/entities/change-request.entity';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { EmailOutbox } from '../src/modules/mail/entities/email-outbox.entity';
import { Notification } from '../src/modules/notifications/entities/notification.entity';
import { NotificationType } from '../src/modules/notifications/enums/notification-type.enum';
import { AvatarStorageService } from '../src/modules/profile/avatar-storage.service';
import { PROFILE_MESSAGES } from '../src/modules/profile/profile.messages';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import { Wing } from '../src/modules/wings/entities/wing.entity';
import { safeUploadPath } from '../src/common/utils/uploads';

const API = '/api/v1';
const DOMAIN = '@e2e-profile.test';
const PASSWORD = 'E2ePass1234';
const ORIGIN = 'http://localhost:3000';

type Fixture = 'officer' | 'officer2' | 'admin' | 'admin2';
const email = (name: string) => `${name}${DOMAIN}`;

interface Msg {
  message: string | string[];
}

describe('Profile, photo, notification email, change requests (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let uploadRoot: string;
  const ids = {} as Record<Fixture, string>;
  const tokens = {} as Record<Fixture, string>;
  let designationId: string;
  let otherDesignationId: string;
  let inactiveDesignationId: string;
  let wingId: string;
  let inactiveWingId: string;

  const http = () => request(app.getHttpServer());
  const as = (who: Fixture) => ({ Authorization: `Bearer ${tokens[who]}` });
  const msg = (res: request.Response) => (res.body as Msg).message;

  async function login(loginEmail: string, password = PASSWORD) {
    return http().post(`${API}/auth/login`).send({ loginEmail, password });
  }

  async function latestMail(to: string): Promise<EmailOutbox> {
    return ds.getRepository(EmailOutbox).findOneOrFail({
      where: { to },
      order: { createdAt: 'DESC' },
    });
  }

  async function jpegWithExif(): Promise<Buffer> {
    return sharp({
      create: {
        width: 900,
        height: 700,
        channels: 3,
        background: { r: 10, g: 120, b: 200 },
      },
    })
      .jpeg()
      .withExif({
        IFD0: {
          ImageDescription: 'SECRET-GPS-23.81N-90.41E',
          Artist: 'SECRET-OWNER',
        },
      })
      .toBuffer();
  }

  async function cleanup(): Promise<void> {
    const users = await ds.getRepository(User).find({
      select: { id: true, photoPath: true },
      where: { loginEmail: Like(`%${DOMAIN}`) },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length > 0) {
      const requests = await ds.getRepository(ChangeRequest).find({
        select: { id: true },
        where: [{ userId: In(userIds) }, { reviewedById: In(userIds) }],
      });
      for (const r of requests) {
        // Notifications and mails about test requests that went to REAL admins.
        await ds
          .getRepository(Notification)
          .delete({ link: `/admin/change-requests/${r.id}` });
        await ds.getRepository(EmailOutbox).delete({ html: Like(`%${r.id}%`) });
      }
      await ds.getRepository(ChangeRequest).delete({ userId: In(userIds) });
      await ds.getRepository(AuditLog).delete({ actorId: In(userIds) });
      await ds.getRepository(AuditLog).delete({ entityId: In(userIds) });
      for (const u of users) {
        if (u.photoPath)
          await app.get(AvatarStorageService).remove(u.photoPath);
      }
      await ds.getRepository(User).delete({ id: In(userIds) });
    }
    await ds.getRepository(EmailOutbox).delete({ to: Like(`%${DOMAIN}`) });
    await ds.getRepository(Designation).delete({ nameEn: Like('E2EP %') });
    await ds.getRepository(Wing).delete({ nameEn: Like('E2EP %') });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    uploadRoot = app.get(AvatarStorageService).root;
    await cleanup();

    const insertDesignation = async (
      nameEn: string,
      priority: number,
      isActive = true,
    ) =>
      (
        await ds.getRepository(Designation).insert({
          nameBn: `ই২ইপি ${priority}`,
          nameEn,
          priority,
          isActive,
        })
      ).identifiers[0].id as string;
    designationId = await insertDesignation('E2EP Designation', 98);
    otherDesignationId = await insertDesignation('E2EP Other', 97);
    inactiveDesignationId = await insertDesignation('E2EP Inactive', 96, false);
    wingId = (
      await ds
        .getRepository(Wing)
        .insert({ nameBn: 'ই২ইপি উইং', nameEn: 'E2EP Wing' })
    ).identifiers[0].id as string;
    inactiveWingId = (
      await ds.getRepository(Wing).insert({
        nameBn: 'ই২ইপি বন্ধ উইং',
        nameEn: 'E2EP Inactive Wing',
        isActive: false,
      })
    ).identifiers[0].id as string;

    const passwordHash = await hashPassword(PASSWORD);
    const fixtures: Array<[Fixture, UserRole]> = [
      ['officer', UserRole.OFFICER],
      ['officer2', UserRole.OFFICER],
      ['admin', UserRole.ADMIN],
      ['admin2', UserRole.ADMIN],
    ];
    for (const [name, role] of fixtures) {
      ids[name] = (
        await ds.getRepository(User).insert({
          loginEmail: email(name),
          notificationEmail: email(name),
          passwordHash,
          nameBn: `ই২ইপি ${name}`,
          nameEn: `E2EP ${name}`,
          designationId,
          mobile: '01700000000',
          role,
          mustChangePassword: false,
        })
      ).identifiers[0].id as string;
      tokens[name] = (
        (await login(email(name))).body as { accessToken: string }
      ).accessToken;
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  // ------------------------------------------------------------------ profile

  describe('GET/PATCH /profile', () => {
    it('returns my profile without hashes or admin-only fields', async () => {
      const res = await http()
        .get(`${API}/profile`)
        .set(as('officer'))
        .expect(200);
      expect(res.body).toMatchObject({
        loginEmail: email('officer'),
        designation: { id: designationId },
        additionalCharges: [],
      });
      const json = JSON.stringify(res.body);
      expect(json).not.toMatch(
        /passwordHash|TokenHash|failedLoginCount|"isActive"/,
      );
    });

    it.each([
      ['loginEmail', 'hacker@e2e-profile.test'],
      ['designationId', '3f1c2a9e-1111-4222-8333-444455556666'],
      ['role', 'ADMIN'],
      ['isActive', false],
      ['notificationEmail', 'x@e2e-profile.test'],
      ['passwordHash', 'x'],
      ['mustChangePassword', false],
    ])(
      'rejects the forbidden field %s (Bangla message, nothing changes)',
      async (field, value) => {
        const res = await http()
          .patch(`${API}/profile`)
          .set(as('officer'))
          .send({ nameEn: 'E2EP officer', [field]: value })
          .expect(400);
        expect(msg(res)).toEqual([
          `"${field}" ফিল্ডটি এখানে পাঠানো বা পরিবর্তন করা যাবে না।`,
        ]);
        const user = await ds
          .getRepository(User)
          .findOneByOrFail({ id: ids.officer });
        expect(user).toMatchObject({
          loginEmail: email('officer'),
          role: UserRole.OFFICER,
          isActive: true,
          designationId,
        });
      },
    );

    it('normalises mobile numbers (Bangla digits, +880) to 01XXXXXXXXX', async () => {
      const res = await http()
        .patch(`${API}/profile`)
        .set(as('officer'))
        .send({ mobile: '০১৭১-২৩৪৫৬৭৮', mobileAlt: '+880 1812-345678' })
        .expect(200);
      expect(res.body).toMatchObject({
        mobile: '01712345678',
        mobileAlt: '01812345678',
      });

      const bad = await http()
        .patch(`${API}/profile`)
        .set(as('officer'))
        .send({ mobile: '12345' })
        .expect(400);
      expect(msg(bad)).toContain('সঠিক মোবাইল নম্বর দিন (যেমন 01712345678)।');
    });

    it('updates allowed fields, replaces additional charges, accepts only active wings', async () => {
      await http()
        .patch(`${API}/profile`)
        .set(as('officer'))
        .send({ wingId: inactiveWingId })
        .expect(400);
      const res = await http()
        .patch(`${API}/profile`)
        .set(as('officer'))
        .send({
          nameBn: 'ই২ইপি অফিসার',
          wingId,
          designationRemark: 'চলতি দায়িত্ব',
          additionalCharges: ['এসডিজি সেল', 'ফোকাল পয়েন্ট'],
        })
        .expect(200);
      expect(res.body).toMatchObject({
        nameBn: 'ই২ইপি অফিসার',
        wing: { id: wingId },
        designationRemark: 'চলতি দায়িত্ব',
      });
      expect(
        (
          res.body as { additionalCharges: Array<{ description: string }> }
        ).additionalCharges.map((c) => c.description),
      ).toEqual(['এসডিজি সেল', 'ফোকাল পয়েন্ট']);

      const audits = await ds.getRepository(AuditLog).find({
        where: { actorId: ids.officer, action: AuditAction.PROFILE_UPDATE },
      });
      expect(audits.length).toBeGreaterThan(0);
      expect(JSON.stringify(audits)).not.toMatch(/0171|0181|\+880/); // no phone values
      expect(
        audits.every((a) =>
          Array.isArray((a.after as { fields: unknown }).fields),
        ),
      ).toBe(true);
    });
  });

  // ------------------------------------------------------------------ photo

  describe('profile photo', () => {
    it('re-encodes to a 512×512 WebP without EXIF, serves it read-only with nosniff', async () => {
      const res = await http()
        .post(`${API}/profile/photo`)
        .set(as('officer'))
        .attach('file', await jpegWithExif(), {
          filename: 'me.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);
      const photoPath = (res.body as { photoPath: string }).photoPath;
      expect(photoPath).toMatch(/^avatars\/[0-9a-f-]{36}\.webp$/);

      const stored = await readFile(safeUploadPath(uploadRoot, photoPath));
      const meta = await sharp(stored).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 512, height: 512 });
      expect(meta.exif).toBeUndefined();
      expect(stored.includes('SECRET')).toBe(false);

      const served = await http().get(`/uploads/${photoPath}`).expect(200);
      expect(served.headers['content-type']).toBe('image/webp');
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(served.headers['cross-origin-resource-policy']).toBe('same-site');
    });

    it('replacing the photo deletes the old file', async () => {
      const before = await ds
        .getRepository(User)
        .findOneByOrFail({ id: ids.officer });
      const oldPath = before.photoPath!;
      const png = await sharp({
        create: {
          width: 300,
          height: 300,
          channels: 4,
          background: '#00ff0080',
        },
      })
        .png()
        .toBuffer();
      const res = await http()
        .post(`${API}/profile/photo`)
        .set(as('officer'))
        .attach('file', png, { filename: 'new.png', contentType: 'image/png' })
        .expect(201);
      const newPath = (res.body as { photoPath: string }).photoPath;
      expect(newPath).not.toBe(oldPath);
      expect(existsSync(safeUploadPath(uploadRoot, oldPath))).toBe(false);
      expect(existsSync(safeUploadPath(uploadRoot, newPath))).toBe(true);
      await http().get(`/uploads/${oldPath}`).expect(404);
    });

    it('rejects a fake image (text with a .png name and image/png type)', async () => {
      const res = await http()
        .post(`${API}/profile/photo`)
        .set(as('officer2'))
        .attach('file', Buffer.from('<script>alert(1)</script> not a png'), {
          filename: 'evil.png',
          contentType: 'image/png',
        })
        .expect(400);
      expect(msg(res)).toBe(PROFILE_MESSAGES.photoBadType);
      const user = await ds
        .getRepository(User)
        .findOneByOrFail({ id: ids.officer2 });
      expect(user.photoPath).toBeNull();
    });

    it('rejects a file larger than MAX_UPLOAD_MB with 413 (Bangla) and a missing file with 400', async () => {
      const big = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff]),
        Buffer.alloc(3 * 1024 * 1024),
      ]);
      const res = await http()
        .post(`${API}/profile/photo`)
        .set(as('officer2'))
        .attach('file', big, { filename: 'big.jpg', contentType: 'image/jpeg' })
        .expect(413);
      expect(msg(res)).toMatch(/সর্বোচ্চ \d+ MB/);

      const missing = await http()
        .post(`${API}/profile/photo`)
        .set(as('officer2'))
        .expect(400);
      expect(msg(missing)).toBe(PROFILE_MESSAGES.photoMissing);
    });

    it('/uploads has no directory listing and does not escape the folder', async () => {
      await http().get('/uploads/').expect(404);
      await http().get('/uploads/avatars/').expect(404);
      const escape = await http().get('/uploads/..%2F.env');
      expect(escape.status).not.toBe(200);
    });

    it('DELETE /profile/photo removes the file and the path', async () => {
      const before = await ds
        .getRepository(User)
        .findOneByOrFail({ id: ids.officer });
      await http()
        .delete(`${API}/profile/photo`)
        .set(as('officer'))
        .expect(200);
      const after = await ds
        .getRepository(User)
        .findOneByOrFail({ id: ids.officer });
      expect(after.photoPath).toBeNull();
      expect(existsSync(safeUploadPath(uploadRoot, before.photoPath!))).toBe(
        false,
      );
      const actions = (
        await ds
          .getRepository(AuditLog)
          .find({ where: { actorId: ids.officer } })
      ).map((a) => a.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          AuditAction.PROFILE_PHOTO_UPDATE,
          AuditAction.PROFILE_PHOTO_DELETE,
        ]),
      );
    });
  });

  // ------------------------------------------------------------------ notification email

  describe('notification email', () => {
    const newAddress = `fresh.notify${DOMAIN}`;
    const tokenFrom = (mail: EmailOutbox) =>
      /verify-email\?token=([A-Za-z0-9_-]+)/.exec(mail.html ?? '')![1];

    it('verification link to the new address, notice to the old; works exactly once', async () => {
      await http()
        .post(`${API}/profile/notification-email`)
        .set(as('officer2'))
        .send({ email: newAddress })
        .expect(200);

      const verifyMail = await latestMail(newAddress);
      const notice = await latestMail(email('officer2'));
      expect(notice.subject).toContain('পরিবর্তনের অনুরোধ');
      const token = tokenFrom(verifyMail);
      expect(notice.html).not.toContain(token);

      let user = await ds
        .getRepository(User)
        .findOneByOrFail({ id: ids.officer2 });
      expect(user.notificationEmail).toBe(email('officer2')); // not active yet
      expect(user.pendingNotificationEmail).toBe(newAddress);

      await http()
        .get(`${API}/profile/notification-email/verify`)
        .query({ token })
        .expect(200); // public: no Authorization header
      user = await ds.getRepository(User).findOneByOrFail({ id: ids.officer2 });
      expect(user).toMatchObject({
        notificationEmail: newAddress,
        pendingNotificationEmail: null,
        loginEmail: email('officer2'), // never touched
      });

      const again = await http()
        .get(`${API}/profile/notification-email/verify`)
        .query({ token })
        .expect(400);
      expect(msg(again)).toBe(PROFILE_MESSAGES.invalidVerifyToken);
    });

    it('an expired link (older than 24 h) does not work', async () => {
      await http()
        .post(`${API}/profile/notification-email`)
        .set(as('officer2'))
        .send({ email: `late${DOMAIN}` })
        .expect(200);
      const token = tokenFrom(await latestMail(`late${DOMAIN}`));
      await ds.getRepository(User).update(ids.officer2, {
        notificationEmailTokenExpiresAt: new Date(Date.now() - 1000),
      });
      await http()
        .get(`${API}/profile/notification-email/verify`)
        .query({ token })
        .expect(400);
      const user = await ds
        .getRepository(User)
        .findOneByOrFail({ id: ids.officer2 });
      expect(user.notificationEmail).toBe(newAddress);
    });

    it('refuses the current address and invalid emails', async () => {
      await http()
        .post(`${API}/profile/notification-email`)
        .set(as('officer2'))
        .send({ email: newAddress })
        .expect(400);
      await http()
        .post(`${API}/profile/notification-email`)
        .set(as('officer2'))
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  // ------------------------------------------------------------------ change requests

  describe('change requests', () => {
    const requestEmail = `officer.new${DOMAIN}`;
    let emailRequestId: string;

    it('officer requests a login-email change; all other admins get a bell notification', async () => {
      const res = await http()
        .post(`${API}/profile/change-requests`)
        .set(as('officer'))
        .send({ type: 'LOGIN_EMAIL', loginEmail: requestEmail.toUpperCase() })
        .expect(201);
      emailRequestId = (res.body as { id: string }).id;
      expect(res.body).toMatchObject({
        status: 'PENDING',
        currentValue: { loginEmail: email('officer') },
        requestedValue: { loginEmail: requestEmail },
      });
      const notified = await ds.getRepository(Notification).find({
        where: { link: `/admin/change-requests/${emailRequestId}` },
      });
      const notifiedIds = notified.map((n) => n.userId);
      expect(notifiedIds).toEqual(
        expect.arrayContaining([ids.admin, ids.admin2]),
      );
      expect(notifiedIds).not.toContain(ids.officer);
      expect(notified[0].type).toBe(NotificationType.CHANGE_REQUEST_SUBMITTED);
    });

    it('only one PENDING request per type (409)', async () => {
      const res = await http()
        .post(`${API}/profile/change-requests`)
        .set(as('officer'))
        .send({ type: 'LOGIN_EMAIL', loginEmail: `other${DOMAIN}` })
        .expect(409);
      expect(msg(res)).toBe(CHANGE_REQUEST_MESSAGES.onePending);
    });

    it('validates designation requests and taken emails', async () => {
      const same = await http()
        .post(`${API}/profile/change-requests`)
        .set(as('officer2'))
        .send({ type: 'DESIGNATION', designationId })
        .expect(400);
      expect(msg(same)).toBe(CHANGE_REQUEST_MESSAGES.sameDesignation);
      await http()
        .post(`${API}/profile/change-requests`)
        .set(as('officer2'))
        .send({ type: 'DESIGNATION', designationId: inactiveDesignationId })
        .expect(400);
      const taken = await http()
        .post(`${API}/profile/change-requests`)
        .set(as('officer2'))
        .send({ type: 'LOGIN_EMAIL', loginEmail: email('admin') })
        .expect(409);
      expect(msg(taken)).toBe(CHANGE_REQUEST_MESSAGES.loginEmailTaken);
      await http()
        .post(`${API}/profile/change-requests`)
        .set(as('officer2'))
        .send({ type: 'LOGIN_EMAIL' })
        .expect(400);
    });

    it('officer can cancel only their own PENDING request', async () => {
      const created = await http()
        .post(`${API}/profile/change-requests`)
        .set(as('officer2'))
        .send({ type: 'DESIGNATION', designationId: otherDesignationId })
        .expect(201);
      const id = (created.body as { id: string }).id;

      await http()
        .delete(`${API}/profile/change-requests/${id}`)
        .set(as('officer'))
        .expect(404);
      const cancelled = await http()
        .delete(`${API}/profile/change-requests/${id}`)
        .set(as('officer2'))
        .expect(200);
      expect((cancelled.body as { status: string }).status).toBe('CANCELLED');
      await http()
        .delete(`${API}/profile/change-requests/${id}`)
        .set(as('officer2'))
        .expect(409);

      const mine = await http()
        .get(`${API}/profile/change-requests`)
        .set(as('officer2'))
        .expect(200);
      expect(
        (mine.body as Array<{ id: string; status: string }>).find(
          (r) => r.id === id,
        )?.status,
      ).toBe('CANCELLED');
    });

    it('officers get 403 on admin change-request routes', async () => {
      await http().get(`${API}/change-requests`).set(as('officer')).expect(403);
      await http()
        .post(`${API}/change-requests/${emailRequestId}/approve`)
        .set(as('officer'))
        .send({})
        .expect(403);
      await http()
        .post(`${API}/change-requests/${emailRequestId}/reject`)
        .set(as('officer'))
        .send({ note: 'না' })
        .expect(403);
    });

    it('admin list filters by status and type and shows current vs requested', async () => {
      const res = await http()
        .get(`${API}/change-requests`)
        .query({ status: 'PENDING', type: 'LOGIN_EMAIL', limit: 100 })
        .set(as('admin'))
        .expect(200);
      const page = res.body as {
        items: Array<{
          id: string;
          status: string;
          type: string;
          requester: { nameEn: string };
        }>;
      };
      const item = page.items.find((i) => i.id === emailRequestId);
      expect(item).toMatchObject({
        requester: { nameEn: 'E2EP officer' },
        currentValue: { loginEmail: email('officer') },
        requestedValue: { loginEmail: requestEmail },
      });
      expect(
        page.items.every(
          (i) => i.status === 'PENDING' && i.type === 'LOGIN_EMAIL',
        ),
      ).toBe(true);
    });

    it('approve LOGIN_EMAIL: applied, sessions ended, both addresses mailed, officer notified', async () => {
      const session = await login(email('officer'));
      const refreshCookie = (
        session.headers['set-cookie'] as unknown as string[]
      )
        .find((c) => c.startsWith('refresh_token='))!
        .split(';')[0];

      const res = await http()
        .post(`${API}/change-requests/${emailRequestId}/approve`)
        .set(as('admin'))
        .send({ note: 'যাচাই করা হলো' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'APPROVED',
        reviewedBy: { id: ids.admin },
        reviewNote: 'যাচাই করা হলো',
      });

      const user = await ds
        .getRepository(User)
        .findOneByOrFail({ id: ids.officer });
      expect(user.loginEmail).toBe(requestEmail);
      expect(
        await ds
          .getRepository(RefreshToken)
          .countBy({ userId: ids.officer, revokedAt: IsNull() }),
      ).toBe(0);
      await http()
        .post(`${API}/auth/refresh`)
        .set('Origin', ORIGIN)
        .set('Cookie', refreshCookie)
        .expect(401);

      expect((await latestMail(email('officer'))).subject).toContain(
        'লগইন ইমেইল পরিবর্তিত',
      );
      expect((await latestMail(requestEmail)).subject).toContain(
        'লগইন ইমেইল পরিবর্তিত',
      );

      expect((await login(email('officer'))).status).toBe(401);
      const fresh = await login(requestEmail);
      expect(fresh.status).toBe(200);
      tokens.officer = (fresh.body as { accessToken: string }).accessToken;

      const approved = await ds.getRepository(Notification).findOneByOrFail({
        userId: ids.officer,
        type: NotificationType.CHANGE_REQUEST_APPROVED,
      });
      expect(approved.link).toBe('/profile/change-requests');

      await http()
        .post(`${API}/change-requests/${emailRequestId}/approve`)
        .set(as('admin2'))
        .send({})
        .expect(409); // already decided
    });

    it('approve fails (409) if the email was taken meanwhile; the request stays PENDING', async () => {
      const wanted = `wanted${DOMAIN}`;
      const created = await http()
        .post(`${API}/profile/change-requests`)
        .set(as('officer2'))
        .send({ type: 'LOGIN_EMAIL', loginEmail: wanted })
        .expect(201);
      const id = (created.body as { id: string }).id;

      // Someone else gets that address before the admin decides.
      await ds.getRepository(User).insert({
        loginEmail: wanted,
        notificationEmail: wanted,
        passwordHash: await hashPassword(PASSWORD),
        nameBn: 'ই২ইপি দখল',
        nameEn: 'E2EP squatter',
        designationId,
        mustChangePassword: false,
      });

      const res = await http()
        .post(`${API}/change-requests/${id}/approve`)
        .set(as('admin'))
        .send({})
        .expect(409);
      expect(msg(res)).toBe(CHANGE_REQUEST_MESSAGES.loginEmailTaken);
      const stored = await ds
        .getRepository(ChangeRequest)
        .findOneByOrFail({ id });
      expect(stored.status).toBe('PENDING');
      const user = await ds
        .getRepository(User)
        .findOneByOrFail({ id: ids.officer2 });
      expect(user.loginEmail).toBe(email('officer2'));
    });

    it('an admin cannot approve their own request; another admin can (designation applied)', async () => {
      const created = await http()
        .post(`${API}/profile/change-requests`)
        .set(as('admin'))
        .send({ type: 'DESIGNATION', designationId: otherDesignationId })
        .expect(201);
      const id = (created.body as { id: string }).id;

      const own = await http()
        .post(`${API}/change-requests/${id}/approve`)
        .set(as('admin'))
        .send({})
        .expect(403);
      expect(msg(own)).toBe(CHANGE_REQUEST_MESSAGES.ownRequest);

      await http()
        .post(`${API}/change-requests/${id}/approve`)
        .set(as('admin2'))
        .send({})
        .expect(200);
      const admin = await ds
        .getRepository(User)
        .findOneByOrFail({ id: ids.admin });
      expect(admin.designationId).toBe(otherDesignationId);
      const audit = await ds.getRepository(AuditLog).findOneByOrFail({
        action: AuditAction.CHANGE_REQUEST_APPROVE,
        entityId: id,
      });
      expect(audit.actorId).toBe(ids.admin2);
      expect(audit.before).toEqual({ designationId });
    });

    it('reject requires a note; the officer is notified; a rejected request cannot be approved', async () => {
      const created = await http()
        .post(`${API}/profile/change-requests`)
        .set(as('officer'))
        .send({ type: 'DESIGNATION', designationId: otherDesignationId })
        .expect(201);
      const id = (created.body as { id: string }).id;

      await http()
        .post(`${API}/change-requests/${id}/reject`)
        .set(as('admin'))
        .send({})
        .expect(400);
      await http()
        .post(`${API}/change-requests/${id}/reject`)
        .set(as('admin'))
        .send({ note: ' ' })
        .expect(400);
      const res = await http()
        .post(`${API}/change-requests/${id}/reject`)
        .set(as('admin'))
        .send({ note: 'পদোন্নতির আদেশ সংযুক্ত করুন' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'REJECTED',
        reviewNote: 'পদোন্নতির আদেশ সংযুক্ত করুন',
      });

      const notice = await ds.getRepository(Notification).findOneByOrFail({
        userId: ids.officer,
        type: NotificationType.CHANGE_REQUEST_REJECTED,
      });
      expect(notice.body).toContain('পদোন্নতির আদেশ সংযুক্ত করুন');
      await http()
        .post(`${API}/change-requests/${id}/approve`)
        .set(as('admin2'))
        .send({})
        .expect(409);

      const user = await ds
        .getRepository(User)
        .findOneByOrFail({ id: ids.officer });
      expect(user.designationId).toBe(designationId); // unchanged
    });

    it('every change-request action is audited', async () => {
      const actions = (
        await ds.getRepository(AuditLog).find({
          where: { entityType: 'change_request', actorId: Not(IsNull()) },
        })
      ).map((a) => a.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          AuditAction.CHANGE_REQUEST_CREATE,
          AuditAction.CHANGE_REQUEST_CANCEL,
          AuditAction.CHANGE_REQUEST_APPROVE,
          AuditAction.CHANGE_REQUEST_REJECT,
        ]),
      );
    });
  });
});
