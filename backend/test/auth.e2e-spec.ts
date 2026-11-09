/**
 * Auth e2e tests against the real app and database (needs backend/.env + migrated DB).
 * Creates its own fixture users (*@e2e.test) and a test designation, and deletes them —
 * with their tokens, audit rows and outbox mails — afterwards.
 */
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In, IsNull, MoreThanOrEqual } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Roles } from '../src/common/decorators/roles.decorator';
import { hashPassword } from '../src/common/utils/password';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum';
import { AUTH_MESSAGES } from '../src/modules/auth/auth.messages';
import { RefreshToken } from '../src/modules/auth/entities/refresh-token.entity';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { EmailOutbox } from '../src/modules/mail/entities/email-outbox.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';

/** Test-only routes to prove the global guards on a "normal" protected endpoint. */
@Controller('e2e-protected')
class ProtectedTestController {
  @Get()
  ping() {
    return { ok: true };
  }

  @Roles(UserRole.ADMIN)
  @Get('admin')
  admin() {
    return { ok: true };
  }
}

const ORIGIN = 'http://localhost:3000'; // in CORS_ORIGINS (.env)
const PASSWORD = 'E2ePass1234';
const API = '/api/v1';

type Fixture = 'active' | 'pending' | 'hint' | 'reuse' | 'reset' | 'admin';
const email = (name: Fixture) => `${name}@e2e.test`;

function cookieValue(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const line = raw?.find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0].slice(name.length + 1);
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let designationId: string;
  const userIds: Record<Fixture, string> = {} as Record<Fixture, string>;
  const startedAt = new Date();

  const http = () => request(app.getHttpServer());
  const login = (name: Fixture, password = PASSWORD) =>
    http()
      .post(`${API}/auth/login`)
      .send({ loginEmail: email(name), password });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedTestController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);

    await cleanup(); // leftovers of an aborted earlier run
    designationId = (
      await ds.getRepository(Designation).insert({
        nameBn: 'ই২ই পরীক্ষা',
        nameEn: 'E2E Test Designation',
        priority: 99,
      })
    ).identifiers[0].id as string;

    const passwordHash = await hashPassword(PASSWORD);
    const fixtures: Array<[Fixture, Partial<User>]> = [
      ['active', {}],
      ['pending', { mustChangePassword: true }],
      ['hint', {}],
      ['reuse', {}],
      ['reset', {}],
      ['admin', { role: UserRole.ADMIN }],
    ];
    for (const [name, extra] of fixtures) {
      const result = await ds.getRepository(User).insert({
        loginEmail: email(name),
        notificationEmail: email(name),
        passwordHash,
        nameBn: 'ই২ই ব্যবহারকারী',
        nameEn: `E2E ${name}`,
        designationId,
        mustChangePassword: false,
        role: UserRole.OFFICER,
        ...extra,
      });
      userIds[name] = result.identifiers[0].id as string;
    }
  });

  async function cleanup(): Promise<void> {
    const users = await ds.getRepository(User).find({
      select: { id: true, loginEmail: true },
      where: {
        nameEn: In(
          ['active', 'pending', 'hint', 'reuse', 'reset', 'admin'].map(
            (n) => `E2E ${n}`,
          ),
        ),
      },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      await ds.getRepository(AuditLog).delete({ actorId: In(ids) });
      await ds
        .getRepository(EmailOutbox)
        .delete({ to: In(users.map((u) => u.loginEmail)) });
      await ds.getRepository(User).delete({ id: In(ids) }); // tokens CASCADE
    }
    // Failed logins with an unknown email have no actor; remove the ones from this run.
    await ds.getRepository(AuditLog).delete({
      actorId: IsNull(),
      action: AuditAction.LOGIN_FAILED,
      createdAt: MoreThanOrEqual(startedAt),
    });
    await ds
      .getRepository(Designation)
      .delete({ nameEn: 'E2E Test Designation' });
  }

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('login → me → refresh → logout', () => {
    it('runs the full session cycle with cookies and Bearer', async () => {
      const agent = request.agent(app.getHttpServer());

      const loginRes = await agent
        .post(`${API}/auth/login`)
        .send({ loginEmail: 'ACTIVE@e2e.test', password: PASSWORD }) // email is case-insensitive
        .expect(200);
      const body = loginRes.body as {
        accessToken: string;
        user: Record<string, unknown>;
      };
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.user).toMatchObject({
        loginEmail: email('active'),
        priority: 99,
      });
      expect(JSON.stringify(body)).not.toMatch(/passwordHash|argon2/);

      const cookies = (
        loginRes.headers['set-cookie'] as unknown as string[]
      ).join('\n');
      expect(cookies).toMatch(/access_token=.*HttpOnly.*SameSite=Lax/);
      expect(cookies).toMatch(
        /refresh_token=.*Path=\/api\/v1\/auth.*HttpOnly.*SameSite=Strict/,
      );

      // me — via Bearer header and via cookie
      await http()
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      await agent.get(`${API}/auth/me`).expect(200);

      // refresh (cookie) rotates the refresh token
      const oldRefresh = cookieValue(loginRes, 'refresh_token');
      const refreshRes = await agent
        .post(`${API}/auth/refresh`)
        .set('Origin', ORIGIN)
        .expect(200);
      expect(cookieValue(refreshRes, 'refresh_token')).not.toBe(oldRefresh);

      // logout revokes it and clears cookies
      await agent.post(`${API}/auth/logout`).set('Origin', ORIGIN).expect(200);
      await agent.post(`${API}/auth/refresh`).set('Origin', ORIGIN).expect(401);
    });

    it('requires login on protected routes, allows public ones', async () => {
      await http().get(`${API}/auth/me`).expect(401);
      await http().get(`${API}/e2e-protected`).expect(401);
      await http().get(`${API}/health`).expect(200);
    });

    it('enforces @Roles: officer → 403, admin → 200', async () => {
      const officer = (await login('active').expect(200)).body as {
        accessToken: string;
      };
      const admin = (await login('admin').expect(200)).body as {
        accessToken: string;
      };
      const res = await http()
        .get(`${API}/e2e-protected/admin`)
        .set('Authorization', `Bearer ${officer.accessToken}`)
        .expect(403);
      expect((res.body as { message: string }).message).toBe(
        AUTH_MESSAGES.forbiddenRole,
      );
      await http()
        .get(`${API}/e2e-protected/admin`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(200);
    });
  });

  describe('CSRF origin check (cookie requests)', () => {
    it('blocks cookie POSTs without/with a foreign Origin, allows Bearer', async () => {
      const agent = request.agent(app.getHttpServer());
      const { accessToken } = (
        await agent
          .post(`${API}/auth/login`)
          .send({ loginEmail: email('active'), password: PASSWORD })
      ).body as { accessToken: string };

      const noOrigin = await agent.post(`${API}/auth/refresh`).expect(403);
      expect((noOrigin.body as { message: string }).message).toBe(
        AUTH_MESSAGES.badOrigin,
      );
      await agent
        .post(`${API}/auth/refresh`)
        .set('Origin', 'https://evil.example')
        .expect(403);

      // Bearer requests are not CSRF-able → no Origin needed.
      await http()
        .post(`${API}/auth/logout`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe('wrong password (no lock, progressive delay)', () => {
    /** Runs a request and returns [response, elapsed ms]. */
    async function timed(
      req: request.Test,
    ): Promise<[request.Response, number]> {
      const started = Date.now();
      const res = await req;
      return [res, Date.now() - started];
    }

    it('gives the identical response for a wrong password and an unknown email, with the forgot-password hint from the first failure', async () => {
      const wrong = await login('active', 'Wrong12345').expect(401);
      const unknown = await http()
        .post(`${API}/auth/login`)
        .send({ loginEmail: 'nobody@e2e.test', password: PASSWORD })
        .expect(401);
      expect(wrong.body).toEqual(unknown.body);
      expect((wrong.body as { message: string }).message).toBe(
        AUTH_MESSAGES.invalidCredentials,
      );
      expect(AUTH_MESSAGES.invalidCredentials).toContain(
        'পাসওয়ার্ড ভুলে গেছেন?',
      );
      await login('active').expect(200); // reset the counter for later tests
    });

    it('never locks: delays from the 6th attempt (2 s, then 4 s even for the right password), then resets', async () => {
      for (let i = 1; i <= 5; i++) {
        const [, ms] = await timed(login('hint', 'Wrong12345').expect(401));
        expect(ms).toBeLessThan(1_500); // no delay for the first 5
      }

      const [sixth, sixthMs] = await timed(
        login('hint', 'Wrong12345').expect(401),
      );
      expect(sixthMs).toBeGreaterThanOrEqual(2_000);
      expect(sixthMs).toBeLessThan(3_500);
      expect((sixth.body as { message: string }).message).toBe(
        AUTH_MESSAGES.invalidCredentials,
      );

      // Correct password after 6 failures: still no lock, but it waits 4 s first.
      const [, okMs] = await timed(login('hint').expect(200));
      expect(okMs).toBeGreaterThanOrEqual(4_000);
      expect(okMs).toBeLessThan(5_500);

      const user = await ds
        .getRepository(User)
        .findOneByOrFail({ id: userIds.hint });
      expect(user.failedLoginCount).toBe(0);
      expect(user.lockedUntil).toBeNull();

      // Counter reset → the next failure is answered at once again.
      const [, afterResetMs] = await timed(
        login('hint', 'Wrong12345').expect(401),
      );
      expect(afterResetMs).toBeLessThan(1_500);

      const failures = await ds.getRepository(AuditLog).find({
        where: { actorId: userIds.hint, action: AuditAction.LOGIN_FAILED },
        order: { createdAt: 'ASC' },
      });
      expect(failures).toHaveLength(7);
      expect(failures[5].after).toMatchObject({ failedCount: 6 });
    }, 30_000);

    it('applies the same delay pattern to an email without an account', async () => {
      const ghost = () =>
        http()
          .post(`${API}/auth/login`)
          .send({
            loginEmail: `ghost-${startedAt.getTime()}@e2e.test`,
            password: PASSWORD,
          })
          .expect(401);
      for (let i = 1; i <= 5; i++) {
        const [, ms] = await timed(ghost());
        expect(ms).toBeLessThan(1_500);
      }
      const [, sixthMs] = await timed(ghost());
      expect(sixthMs).toBeGreaterThanOrEqual(2_000);
      expect(sixthMs).toBeLessThan(3_500);
    }, 30_000);

    it('records lastLoginAt and resets the counter on success', async () => {
      await login('active', 'Wrong12345').expect(401);
      await login('active').expect(200);
      const user = await ds
        .getRepository(User)
        .findOneByOrFail({ id: userIds.active });
      expect(user.failedLoginCount).toBe(0);
      expect(user.lastLoginAt).toBeInstanceOf(Date);
    });

    it('refuses login and refresh for a deactivated user', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent
        .post(`${API}/auth/login`)
        .send({ loginEmail: email('admin'), password: PASSWORD })
        .expect(200);
      await ds.getRepository(User).update(userIds.admin, { isActive: false });
      try {
        await agent
          .post(`${API}/auth/refresh`)
          .set('Origin', ORIGIN)
          .expect(401);
        await agent.get(`${API}/auth/me`).expect(401);
        await login('admin').expect(403);
      } finally {
        await ds.getRepository(User).update(userIds.admin, { isActive: true });
      }
    });
  });

  describe('mustChangePassword', () => {
    it('allows only me / change-password / logout until the password is changed', async () => {
      const res = await login('pending').expect(200);
      const { accessToken, mustChangePassword } = res.body as {
        accessToken: string;
        mustChangePassword: boolean;
      };
      expect(mustChangePassword).toBe(true);
      const bearer = { Authorization: `Bearer ${accessToken}` };

      await http().get(`${API}/auth/me`).set(bearer).expect(200);
      const blocked = await http()
        .get(`${API}/e2e-protected`)
        .set(bearer)
        .expect(403);
      expect((blocked.body as { message: string }).message).toBe(
        AUTH_MESSAGES.mustChangePassword,
      );

      // weak / wrong-current passwords are rejected
      await http()
        .post(`${API}/auth/change-password`)
        .set(bearer)
        .send({ currentPassword: PASSWORD, newPassword: 'short' })
        .expect(400);
      await http()
        .post(`${API}/auth/change-password`)
        .set(bearer)
        .send({ currentPassword: 'Wrong12345', newPassword: 'Brand1New2' })
        .expect(400);

      const changed = await http()
        .post(`${API}/auth/change-password`)
        .set(bearer)
        .send({ currentPassword: PASSWORD, newPassword: 'Brand1New2' })
        .expect(200);
      const fresh = (changed.body as { accessToken: string }).accessToken;
      await http()
        .get(`${API}/e2e-protected`)
        .set('Authorization', `Bearer ${fresh}`)
        .expect(200);

      await login('pending', PASSWORD).expect(401);
      await login('pending', 'Brand1New2').expect(200);
    });

    it('rejects unknown body fields (whitelist + forbidNonWhitelisted)', async () => {
      await http()
        .post(`${API}/auth/login`)
        .send({
          loginEmail: email('active'),
          password: PASSWORD,
          role: 'SUPER_ADMIN',
        })
        .expect(400);
    });
  });

  describe('refresh token reuse detection', () => {
    it('reusing an old refresh token revokes every session of the user', async () => {
      const loginRes = await login('reuse').expect(200);
      const r1 = cookieValue(loginRes, 'refresh_token')!;

      const rotated = await http()
        .post(`${API}/auth/refresh`)
        .set('Origin', ORIGIN)
        .set('Cookie', `refresh_token=${r1}`)
        .expect(200);
      const r2 = cookieValue(rotated, 'refresh_token')!;
      expect(r2).not.toBe(r1);

      // attacker replays the old token
      await http()
        .post(`${API}/auth/refresh`)
        .set('Origin', ORIGIN)
        .set('Cookie', `refresh_token=${r1}`)
        .expect(401);

      // the legitimate newest token is now dead too
      await http()
        .post(`${API}/auth/refresh`)
        .set('Origin', ORIGIN)
        .set('Cookie', `refresh_token=${r2}`)
        .expect(401);

      const active = await ds
        .getRepository(RefreshToken)
        .countBy({ userId: userIds.reuse, revokedAt: IsNull() });
      expect(active).toBe(0);
      const reuseAudit = await ds.getRepository(AuditLog).countBy({
        actorId: userIds.reuse,
        action: AuditAction.REFRESH_TOKEN_REUSE,
      });
      expect(reuseAudit).toBe(1);
    });

    it('stores only hashes of refresh tokens', async () => {
      const res = await login('reuse').expect(200);
      const raw = cookieValue(res, 'refresh_token')!;
      const rows = await ds
        .getRepository(RefreshToken)
        .createQueryBuilder('t')
        .addSelect('t.tokenHash')
        .where('t.userId = :id', { id: userIds.reuse })
        .getMany();
      expect(rows.length).toBeGreaterThan(0);
      expect(
        rows.every(
          (r) => r.tokenHash !== raw && /^[0-9a-f]{64}$/.test(r.tokenHash),
        ),
      ).toBe(true);
    });
  });

  describe('forgot / reset password', () => {
    async function latestResetToken(): Promise<string> {
      const mail = await ds.getRepository(EmailOutbox).findOneOrFail({
        where: { to: email('reset') },
        order: { createdAt: 'DESC' },
      });
      const match = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(
        mail.html ?? '',
      );
      return match![1];
    }

    it('always answers 200 with the same message', async () => {
      const unknown = await http()
        .post(`${API}/auth/forgot-password`)
        .send({ loginEmail: 'nobody@e2e.test' })
        .expect(200);
      const known = await http()
        .post(`${API}/auth/forgot-password`)
        .send({ loginEmail: email('reset') })
        .expect(200);
      expect(unknown.body).toEqual(known.body);
      expect((known.body as { message: string }).message).toBe(
        AUTH_MESSAGES.forgotPasswordSent,
      );
    });

    it('resets once with a valid token; old links and old sessions stop working', async () => {
      const session = await login('reset').expect(200);
      const oldRefresh = cookieValue(session, 'refresh_token')!;

      await http()
        .post(`${API}/auth/forgot-password`)
        .send({ loginEmail: email('reset') });
      const firstToken = await latestResetToken();
      await http()
        .post(`${API}/auth/forgot-password`)
        .send({ loginEmail: email('reset') });
      const token = await latestResetToken();
      expect(token).not.toBe(firstToken);

      // weak password: rejected, token stays usable
      await http()
        .post(`${API}/auth/reset-password`)
        .send({ token, newPassword: 'weak' })
        .expect(400);
      // older link was closed by the newer request
      await http()
        .post(`${API}/auth/reset-password`)
        .send({ token: firstToken, newPassword: 'Reset1Pass' })
        .expect(400);

      await http()
        .post(`${API}/auth/reset-password`)
        .send({ token, newPassword: 'Reset1Pass' })
        .expect(200);
      // single use
      const again = await http()
        .post(`${API}/auth/reset-password`)
        .send({ token, newPassword: 'Other1Pass' })
        .expect(400);
      expect((again.body as { message: string }).message).toBe(
        AUTH_MESSAGES.invalidResetToken,
      );

      await login('reset', PASSWORD).expect(401);
      await login('reset', 'Reset1Pass').expect(200);
      await http()
        .post(`${API}/auth/refresh`)
        .set('Origin', ORIGIN)
        .set('Cookie', `refresh_token=${oldRefresh}`)
        .expect(401);

      const actions = (
        await ds
          .getRepository(AuditLog)
          .find({ where: { actorId: userIds.reset } })
      ).map((a) => a.action);
      expect(actions).toContain(AuditAction.PASSWORD_RESET_REQUEST);
      expect(actions).toContain(AuditAction.PASSWORD_RESET);
    });
  });
});
