/**
 * Step 5 e2e: users, designations and wings management against the real app + DB.
 * Fixtures use the domain @e2e-users.test and the name prefix "E2EU" and are removed afterwards
 * (together with their meetings, tokens, audit rows and outbox mails).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In, IsNull, Like } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/common/utils/password';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum';
import { AUTH_MESSAGES } from '../src/modules/auth/auth.messages';
import { PasswordResetToken } from '../src/modules/auth/entities/password-reset-token.entity';
import { RefreshToken } from '../src/modules/auth/entities/refresh-token.entity';
import { PasswordTokenPurpose } from '../src/modules/auth/enums/password-token-purpose.enum';
import { DESIGNATION_MESSAGES } from '../src/modules/designations/designations.messages';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { EmailOutbox } from '../src/modules/mail/entities/email-outbox.entity';
import { Meeting } from '../src/modules/meetings/entities/meeting.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import { USER_MESSAGES } from '../src/modules/users/users.messages';
import { Wing } from '../src/modules/wings/entities/wing.entity';

const API = '/api/v1';
const DOMAIN = '@e2e-users.test';
const PASSWORD = 'E2ePass1234';

type Fixture = 'super' | 'admin' | 'admin2' | 'officer' | 'inactive';
const email = (name: string) => `${name}${DOMAIN}`;

interface Body {
  message?: string | string[];
  [key: string]: unknown;
}

describe('Users, designations, wings (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const ids = {} as Record<Fixture, string>;
  const tokens = {} as Record<Fixture, string>;
  let designationId: string;
  let wingId: string;

  const http = () => request(app.getHttpServer());
  const as = (who: Fixture) => ({ Authorization: `Bearer ${tokens[who]}` });
  const body = (res: request.Response) => res.body as Body;

  async function loginToken(
    loginEmail: string,
    password: string,
  ): Promise<request.Response> {
    return http().post(`${API}/auth/login`).send({ loginEmail, password });
  }

  async function latestMailTo(to: string): Promise<EmailOutbox> {
    return ds.getRepository(EmailOutbox).findOneOrFail({
      where: { to },
      order: { createdAt: 'DESC' },
    });
  }

  /** Raw token from a one-time link in a queued mail (e.g. "set-password"). */
  const linkToken = (
    mail: EmailOutbox,
    path: 'set-password' | 'reset-password',
  ) => new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`).exec(mail.html ?? '')![1];

  async function cleanup(): Promise<void> {
    const users = await ds.getRepository(User).find({
      select: { id: true },
      where: { loginEmail: Like(`%${DOMAIN}`) },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length > 0) {
      await ds.getRepository(Meeting).delete({ organizerId: In(userIds) });
      await ds.getRepository(AuditLog).delete({ actorId: In(userIds) });
      await ds.getRepository(AuditLog).delete({ entityId: In(userIds) });
      await ds.getRepository(User).delete({ id: In(userIds) });
    }
    await ds.getRepository(EmailOutbox).delete({ to: Like(`%${DOMAIN}`) });
    await ds.getRepository(Designation).delete({ nameEn: Like('E2EU %') });
    await ds.getRepository(Wing).delete({ nameEn: Like('E2EU %') });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    await cleanup();

    designationId = (
      await ds.getRepository(Designation).insert({
        nameBn: 'ই২ইইউ পদবি',
        nameEn: 'E2EU Designation',
        priority: 98,
      })
    ).identifiers[0].id as string;
    wingId = (
      await ds
        .getRepository(Wing)
        .insert({ nameBn: 'ই২ইইউ উইং', nameEn: 'E2EU Wing' })
    ).identifiers[0].id as string;

    const passwordHash = await hashPassword(PASSWORD);
    const fixtures: Array<[Fixture, Partial<User>]> = [
      ['super', { role: UserRole.SUPER_ADMIN, designationId: null }],
      ['admin', { role: UserRole.ADMIN }],
      ['admin2', { role: UserRole.ADMIN }],
      ['officer', { mobile: '01700000001', wingId }],
      ['inactive', { isActive: false }],
    ];
    for (const [name, extra] of fixtures) {
      const result = await ds.getRepository(User).insert({
        loginEmail: email(name),
        notificationEmail: email(name),
        passwordHash,
        nameBn: `ই২ইইউ ${name}`,
        nameEn: `E2EU ${name}`,
        designationId,
        role: UserRole.OFFICER,
        mustChangePassword: false,
        ...extra,
      });
      ids[name] = result.identifiers[0].id as string;
    }
    for (const name of ['super', 'admin', 'admin2', 'officer'] as const) {
      const res = await loginToken(email(name), PASSWORD);
      tokens[name] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  // ------------------------------------------------------------------ permissions

  describe('permissions', () => {
    const adminRoutes: Array<[string, string, object | null]> = [
      ['get', '/users', null],
      ['get', '/users/:id', null],
      ['post', '/users', {}],
      ['patch', '/users/:id', {}],
      ['patch', '/users/:id/status', { isActive: false }],
      ['patch', '/users/:id/role', { role: 'ADMIN' }],
      ['post', '/users/:id/reset-password', null],
      ['post', '/designations', {}],
      ['patch', '/designations/:id', {}],
      ['delete', '/designations/:id', null],
      ['post', '/wings', {}],
      ['patch', '/wings/:id', {}],
      ['delete', '/wings/:id', null],
    ];

    it.each(adminRoutes)(
      'OFFICER → 403 on %s %s',
      async (method, path, payload) => {
        const url = `${API}${path.replace(':id', path.startsWith('/users') ? ids.officer : designationId)}`;
        const req = (
          http() as unknown as Record<string, (u: string) => request.Test>
        )
          [method](url)
          .set(as('officer'));
        const res = await (payload ? req.send(payload) : req).expect(403);
        expect(body(res).message).toBe('এই কাজটি করার অনুমতি আপনার নেই।');
      },
    );

    it('OFFICER can read designations, wings and the directory', async () => {
      await http().get(`${API}/designations`).set(as('officer')).expect(200);
      await http().get(`${API}/wings`).set(as('officer')).expect(200);
      await http().get(`${API}/users/directory`).set(as('officer')).expect(200);
    });

    it('without login → 401', async () => {
      await http().get(`${API}/designations`).expect(401);
      await http().get(`${API}/users/directory`).expect(401);
    });
  });

  // ------------------------------------------------------------------ directory

  describe('GET /users/directory', () => {
    it('returns only minimal fields of active, non-system users', async () => {
      const res = await http()
        .get(`${API}/users/directory`)
        .query({ q: 'E2EU', limit: 100 })
        .set(as('officer'))
        .expect(200);
      const page = res.body as {
        items: Array<Record<string, unknown>>;
        total: number;
      };
      const names = page.items.map((i) => i.nameEn);
      expect(names).toEqual(
        expect.arrayContaining(['E2EU admin', 'E2EU admin2', 'E2EU officer']),
      );
      expect(names).not.toContain('E2EU inactive');
      expect(names).not.toContain('E2EU super');

      for (const item of page.items) {
        expect(Object.keys(item).sort()).toEqual(
          ['designation', 'id', 'nameBn', 'nameEn', 'photoPath', 'wing'].sort(),
        );
        expect(Object.keys(item.designation as object).sort()).toEqual([
          'nameBn',
          'nameEn',
          'priority',
        ]);
      }
      const json = JSON.stringify(page);
      expect(json).not.toContain('@');
      expect(json).not.toMatch(/mobile|role|loginEmail|passwordHash|isActive/);
    });

    it('filters by wing and searches names only (not emails)', async () => {
      const byWing = await http()
        .get(`${API}/users/directory`)
        .query({ wingId })
        .set(as('officer'))
        .expect(200);
      expect(
        (byWing.body as { items: Array<{ nameEn: string }> }).items.map(
          (i) => i.nameEn,
        ),
      ).toEqual(['E2EU officer']);
      const byEmail = await http()
        .get(`${API}/users/directory`)
        .query({ q: 'e2e-users.test' })
        .set(as('officer'))
        .expect(200);
      expect((byEmail.body as { total: number }).total).toBe(0);
    });
  });

  // ------------------------------------------------------------------ admin list / detail

  describe('GET /users (admin)', () => {
    it('searches, filters, sorts and paginates; never returns hashes', async () => {
      const res = await http()
        .get(`${API}/users`)
        .query({
          q: 'E2EU',
          designationId,
          sortBy: 'nameEn',
          sortOrder: 'desc',
          limit: 2,
        })
        .set(as('admin'))
        .expect(200);
      const page = res.body as {
        items: Array<{ nameEn: string }>;
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
      // super admin has no designation → filtered out
      expect(page.total).toBe(4);
      expect(page).toMatchObject({ page: 1, limit: 2, totalPages: 2 });
      expect(page.items.map((i) => i.nameEn)).toEqual([
        'E2EU officer',
        'E2EU inactive',
      ]);
      expect(JSON.stringify(page)).not.toMatch(/passwordHash|tokenHash|argon2/);
    });

    it('finds by mobile, also typed with Bangla digits', async () => {
      const res = await http()
        .get(`${API}/users`)
        .query({ q: '০১৭০০০০০০০১' })
        .set(as('admin'))
        .expect(200);
      expect(
        (res.body as { items: Array<{ nameEn: string }> }).items.map(
          (i) => i.nameEn,
        ),
      ).toEqual(['E2EU officer']);
    });

    it('filters by isActive and role', async () => {
      const res = await http()
        .get(`${API}/users`)
        .query({ q: 'E2EU', isActive: false })
        .set(as('admin'))
        .expect(200);
      expect((res.body as { total: number }).total).toBe(1);
      const admins = await http()
        .get(`${API}/users`)
        .query({ q: 'E2EU', role: 'ADMIN' })
        .set(as('admin'))
        .expect(200);
      expect((admins.body as { total: number }).total).toBe(2);
    });

    it('GET /users/:id returns the full user without hashes; bad id → 400, unknown → 404', async () => {
      const res = await http()
        .get(`${API}/users/${ids.officer}`)
        .set(as('admin'))
        .expect(200);
      expect(res.body).toMatchObject({
        loginEmail: email('officer'),
        additionalCharges: [],
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenHash/);
      await http().get(`${API}/users/not-a-uuid`).set(as('admin')).expect(400);
      await http()
        .get(`${API}/users/3f1c2a9e-1111-4222-8333-444455556666`)
        .set(as('admin'))
        .expect(404);
    });
  });

  // ------------------------------------------------------------------ create / update

  describe('POST /users and PATCH /users/:id', () => {
    it('creates an officer: no password anywhere, a one-time set-password link (72 h) instead', async () => {
      const res = await http()
        .post(`${API}/users`)
        .set(as('admin'))
        .send({
          loginEmail: `  New.Officer${DOMAIN.toUpperCase()} `,
          nameBn: 'ই২ইইউ নতুন',
          nameEn: 'E2EU New',
          designationId,
          mobile: '০১৮১১১১১১১১',
          additionalCharges: ['এসডিজি সেল', ' এসডিজি সেল ', ''],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        loginEmail: email('new.officer'),
        role: 'OFFICER',
        mobile: '01811111111',
        additionalCharges: [
          expect.objectContaining({ description: 'এসডিজি সেল' }),
        ],
      });
      expect(JSON.stringify(res.body)).not.toMatch(
        /"password"|passwordHash|token/i,
      );
      const userId = (res.body as { id: string }).id;

      const mail = await latestMailTo(email('new.officer'));
      expect(mail.subject).toContain('পাসওয়ার্ড সেট করুন');
      expect(mail.html).toContain(email('new.officer'));
      expect(`${mail.html}${mail.text}`).not.toMatch(
        /অস্থায়ী পাসওয়ার্ড|temporary password/i,
      );
      const token = linkToken(mail, 'set-password');
      expect(mail.text).toContain(token); // plain-text version carries the link too

      const row = await ds
        .getRepository(PasswordResetToken)
        .findOneByOrFail({ userId });
      expect(row.purpose).toBe(PasswordTokenPurpose.SET_INITIAL);
      const hours = (row.expiresAt.getTime() - Date.now()) / 3_600_000;
      expect(hours).toBeGreaterThan(71.9);
      expect(hours).toBeLessThanOrEqual(72);

      // Nobody knows a password yet: login is impossible until the link is used.
      expect((await loginToken(email('new.officer'), PASSWORD)).status).toBe(
        401,
      );

      const set = await http()
        .post(`${API}/auth/reset-password`)
        .send({ token, newPassword: 'MyFirst123' })
        .expect(200);
      expect(body(set).message).toBe(AUTH_MESSAGES.passwordSet);
      await http()
        .post(`${API}/auth/reset-password`)
        .send({ token, newPassword: 'Again1234' })
        .expect(400); // single use

      const login = await loginToken(email('new.officer'), 'MyFirst123');
      expect(login.status).toBe(200);
      expect(
        (login.body as { mustChangePassword: boolean }).mustChangePassword,
      ).toBe(false);

      const audit = await ds.getRepository(AuditLog).findOneByOrFail({
        action: AuditAction.USER_CREATE,
        entityId: userId,
      });
      expect(JSON.stringify(audit)).not.toContain(token);
    });

    it('rejects a duplicate login email (case-insensitive) with 409', async () => {
      const res = await http()
        .post(`${API}/users`)
        .set(as('admin'))
        .send({
          loginEmail: email('OFFICER'),
          nameBn: 'ক',
          nameEn: 'E2EU Dup',
          designationId,
        })
        .expect(409);
      expect(body(res).message).toBe(USER_MESSAGES.duplicateLoginEmail);
    });

    it('validates input in Bangla and forbids unknown fields (e.g. role)', async () => {
      const res = await http()
        .post(`${API}/users`)
        .set(as('admin'))
        .send({
          loginEmail: 'bad',
          nameBn: '',
          nameEn: 'x',
          designationId: 'nope',
          role: 'ADMIN',
        })
        .expect(400);
      const messages = body(res).message as string[];
      expect(messages).toEqual(
        expect.arrayContaining([
          'সঠিক লগইন ইমেইল দিন।',
          'সঠিক পদবি নির্বাচন করুন।',
        ]),
      );
    });

    it('admin changes loginEmail (stored lowercase) and designation directly', async () => {
      const other = (
        await ds.getRepository(Designation).insert({
          nameBn: 'ই২ইইউ অন্য',
          nameEn: 'E2EU Other',
          priority: 97,
        })
      ).identifiers[0].id as string;

      const res = await http()
        .patch(`${API}/users/${ids.admin2}`)
        .set(as('admin'))
        .send({ loginEmail: `Admin2.Renamed${DOMAIN}`, designationId: other })
        .expect(200);
      const updated = res.body as {
        loginEmail: string;
        designation: { id: string; priority: number };
      };
      expect(updated.loginEmail).toBe(`admin2.renamed${DOMAIN}`);
      expect(updated.designation).toMatchObject({ id: other, priority: 97 });

      await http()
        .patch(`${API}/users/${ids.admin2}`)
        .set(as('admin'))
        .send({ loginEmail: email('officer') })
        .expect(409);

      const audit = await ds.getRepository(AuditLog).findOneOrFail({
        where: { action: AuditAction.USER_UPDATE, entityId: ids.admin2 },
        order: { createdAt: 'DESC' },
      });
      expect(audit.before).toMatchObject({
        loginEmail: email('admin2'),
        designationId,
      });
    });
  });

  // ------------------------------------------------------------------ protection rules

  describe('SUPER_ADMIN and self protection', () => {
    it('an ADMIN cannot change, deactivate, demote or reset the SUPER_ADMIN', async () => {
      const base = `${API}/users/${ids.super}`;
      for (const [method, path, payload] of [
        ['patch', '', { nameEn: 'Hacked' }],
        ['patch', '/status', { isActive: false }],
        ['patch', '/role', { role: 'OFFICER' }],
        ['post', '/reset-password', undefined],
      ] as const) {
        const req = (
          http() as unknown as Record<string, (u: string) => request.Test>
        )
          [method](base + path)
          .set(as('admin'));
        await (payload ? req.send(payload) : req).expect(403);
      }
      const superAdmin = await ds
        .getRepository(User)
        .findOneByOrFail({ id: ids.super });
      expect(superAdmin).toMatchObject({
        nameEn: 'E2EU super',
        isActive: true,
        role: 'SUPER_ADMIN',
      });
    });

    it('the SUPER_ADMIN may edit themselves, but not their status or role', async () => {
      await http()
        .patch(`${API}/users/${ids.super}`)
        .set(as('super'))
        .send({ nameBn: 'ই২ইইউ সুপার' })
        .expect(200);
      await http()
        .patch(`${API}/users/${ids.super}/status`)
        .set(as('super'))
        .send({ isActive: false })
        .expect(403);
      await http()
        .patch(`${API}/users/${ids.super}/role`)
        .set(as('super'))
        .send({ role: 'ADMIN' })
        .expect(403);
      await http()
        .patch(`${API}/users/${ids.super}`)
        .set(as('super'))
        .send({ designationId })
        .expect(400);
    });

    it('nobody can assign SUPER_ADMIN through the API', async () => {
      await http()
        .patch(`${API}/users/${ids.officer}/role`)
        .set(as('super'))
        .send({ role: 'SUPER_ADMIN' })
        .expect(400);
    });

    it('an admin cannot deactivate or demote themselves', async () => {
      const deactivate = await http()
        .patch(`${API}/users/${ids.admin}/status`)
        .set(as('admin'))
        .send({ isActive: false })
        .expect(403);
      expect(body(deactivate).message).toBe(USER_MESSAGES.selfDeactivate);
      const demote = await http()
        .patch(`${API}/users/${ids.admin}/role`)
        .set(as('admin'))
        .send({ role: 'OFFICER' })
        .expect(403);
      expect(body(demote).message).toBe(USER_MESSAGES.selfRoleChange);
    });
  });

  // ------------------------------------------------------------------ status / role / reset

  describe('status, role and admin password reset', () => {
    it('deactivating ends every session immediately; reactivating allows login again', async () => {
      const session = await loginToken(email('officer'), PASSWORD).then(
        (r) => r,
      );
      const refreshCookie = (
        session.headers['set-cookie'] as unknown as string[]
      )
        .find((c) => c.startsWith('refresh_token='))!
        .split(';')[0];
      const access = (session.body as { accessToken: string }).accessToken;

      await http()
        .patch(`${API}/users/${ids.officer}/status`)
        .set(as('admin'))
        .send({ isActive: false })
        .expect(200);

      await http()
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${access}`)
        .expect(401);
      await http()
        .post(`${API}/auth/refresh`)
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', refreshCookie)
        .expect(401);
      expect((await loginToken(email('officer'), PASSWORD)).status).toBe(403);

      await http()
        .patch(`${API}/users/${ids.officer}/status`)
        .set(as('admin'))
        .send({ isActive: true })
        .expect(200);
      expect((await loginToken(email('officer'), PASSWORD)).status).toBe(200);
      tokens.officer = (
        (await loginToken(email('officer'), PASSWORD)).body as {
          accessToken: string;
        }
      ).accessToken;
    });

    it('promotes and demotes with audit entries', async () => {
      await http()
        .patch(`${API}/users/${ids.officer}/role`)
        .set(as('admin'))
        .send({ role: 'ADMIN' })
        .expect(200);
      // the guard reads the role fresh from the DB: the old token now has admin rights
      await http().get(`${API}/users`).set(as('officer')).expect(200);
      await http()
        .patch(`${API}/users/${ids.officer}/role`)
        .set(as('admin'))
        .send({ role: 'OFFICER' })
        .expect(200);
      await http().get(`${API}/users`).set(as('officer')).expect(403);

      const changes = await ds.getRepository(AuditLog).find({
        where: { action: AuditAction.USER_ROLE_CHANGE, entityId: ids.officer },
        order: { createdAt: 'ASC' },
      });
      expect(changes.map((c) => c.after)).toEqual([
        { role: 'ADMIN' },
        { role: 'OFFICER' },
      ]);
    });

    it('admin reset: old password stops at once, sessions end, a one-time link is mailed', async () => {
      const session = await loginToken(email('officer'), PASSWORD);
      const access = (session.body as { accessToken: string }).accessToken;

      const res = await http()
        .post(`${API}/users/${ids.officer}/reset-password`)
        .set(as('admin'))
        .expect(200);
      expect(body(res).message).toBe(USER_MESSAGES.passwordResetDone);
      expect(JSON.stringify(res.body)).not.toMatch(/"password"|token/i);

      expect((await loginToken(email('officer'), PASSWORD)).status).toBe(401);
      expect(
        await ds
          .getRepository(RefreshToken)
          .countBy({ userId: ids.officer, revokedAt: IsNull() }),
      ).toBe(0);
      await http()
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${access}`)
        .expect(200); // access token lives ≤ 15 min

      const mail = await latestMailTo(email('officer'));
      expect(mail.subject).toContain('রিসেট');
      const token = linkToken(mail, 'reset-password');
      const reset = await http()
        .post(`${API}/auth/reset-password`)
        .send({ token, newPassword: PASSWORD })
        .expect(200);
      expect(body(reset).message).toBe(AUTH_MESSAGES.passwordReset);

      const login = await loginToken(email('officer'), PASSWORD);
      expect(login.status).toBe(200);
      tokens.officer = (login.body as { accessToken: string }).accessToken;
      await http().get(`${API}/designations`).set(as('officer')).expect(200);
    });

    it('refuses to reset an inactive account', async () => {
      const res = await http()
        .post(`${API}/users/${ids.inactive}/reset-password`)
        .set(as('admin'))
        .expect(400);
      expect(body(res).message).toBe(USER_MESSAGES.resetInactive);
    });
  });

  // ------------------------------------------------------------------ designations / wings

  describe('designations and wings', () => {
    it('lists designations by priority for any user, with user counts', async () => {
      const res = await http()
        .get(`${API}/designations`)
        .set(as('officer'))
        .expect(200);
      const list = res.body as Array<{
        priority: number;
        nameEn: string;
        userCount: number;
      }>;
      const priorities = list.map((d) => d.priority);
      expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
      expect(
        list.find((d) => d.nameEn === 'E2EU Designation')?.userCount,
      ).toBeGreaterThan(0);
    });

    it('creates, rejects duplicates case-insensitively, deletes only when unused', async () => {
      const created = await http()
        .post(`${API}/designations`)
        .set(as('admin'))
        .send({
          nameBn: 'ই২ইইউ নতুন পদবি',
          nameEn: 'E2EU Temp Post',
          priority: 50,
        })
        .expect(201);
      await http()
        .post(`${API}/designations`)
        .set(as('admin'))
        .send({ nameBn: 'ক', nameEn: 'e2eu temp POST', priority: 50 })
        .expect(409);

      const inUse = await http()
        .delete(`${API}/designations/${designationId}`)
        .set(as('admin'))
        .expect(409);
      expect(body(inUse).message).toMatch(/জন ব্যবহারকারীর সাথে যুক্ত/);

      await http()
        .delete(`${API}/designations/${(created.body as { id: string }).id}`)
        .set(as('admin'))
        .expect(204);
    });

    it('a priority change is audited and does NOT change existing meetings (snapshot)', async () => {
      const meetingId = (
        await ds.getRepository(Meeting).insert({
          title: 'E2EU snapshot meeting',
          startAt: new Date(Date.now() + 86_400_000),
          endAt: new Date(Date.now() + 90_000_000),
          organizerId: ids.admin,
          priority: 98,
        })
      ).identifiers[0].id as string;

      await http()
        .patch(`${API}/designations/${designationId}`)
        .set(as('admin'))
        .send({ priority: 3 })
        .expect(200);

      const meeting = await ds
        .getRepository(Meeting)
        .findOneByOrFail({ id: meetingId });
      expect(meeting.priority).toBe(98);

      const audit = await ds.getRepository(AuditLog).findOneOrFail({
        where: {
          action: AuditAction.DESIGNATION_PRIORITY_CHANGE,
          entityId: designationId,
        },
      });
      expect(audit.before).toEqual({ priority: 98 });
      expect(audit.after).toEqual({ priority: 3 });
    });

    it('an inactive designation cannot be given to users', async () => {
      const inactive = (
        await ds.getRepository(Designation).insert({
          nameBn: 'ই২ইইউ নিষ্ক্রিয়',
          nameEn: 'E2EU Inactive Post',
          priority: 60,
          isActive: false,
        })
      ).identifiers[0].id as string;
      await http()
        .patch(`${API}/users/${ids.admin2}`)
        .set(as('admin'))
        .send({ designationId: inactive })
        .expect(400);
      const active = await http()
        .get(`${API}/designations`)
        .query({ activeOnly: true })
        .set(as('officer'))
        .expect(200);
      expect(
        (active.body as Array<{ nameEn: string }>).some(
          (d) => d.nameEn === 'E2EU Inactive Post',
        ),
      ).toBe(false);
    });

    it('wings: duplicate → 409, delete in use → 409, unused → 204', async () => {
      await http()
        .post(`${API}/wings`)
        .set(as('admin'))
        .send({ nameBn: 'ক', nameEn: 'E2EU WING' })
        .expect(409);
      await http()
        .delete(`${API}/wings/${wingId}`)
        .set(as('admin'))
        .expect(409);
      const created = await http()
        .post(`${API}/wings`)
        .set(as('admin'))
        .send({ nameBn: 'ই২ইইউ অস্থায়ী', nameEn: 'E2EU Temp Wing' })
        .expect(201);
      await http()
        .delete(`${API}/wings/${(created.body as { id: string }).id}`)
        .set(as('admin'))
        .expect(204);
    });

    it('designation delete message is the Bangla in-use text', () => {
      expect(DESIGNATION_MESSAGES.inUse(2)).toContain('নিষ্ক্রিয় করুন');
    });
  });
});
