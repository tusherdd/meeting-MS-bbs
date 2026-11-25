/**
 * Release v1.21 e2e on the TEST database:
 * - POST /meetings/notice-extract (SPEC.md §6.12): SUPER_ADMIN 403; the notice file rules (wrong type,
 *   macro, no file → 400); a DOCX notice in the one fixed format → the parsed fields, the chair and the
 *   distribution list matched against our officers (the "অনুলিপি" list ignored); nothing stored; audit with
 *   method / success / duration only; 20 per user per day (the 21st → 429, per user).
 * - GET / PATCH /admin/settings (§6.13): default OCR, AI refused without ANTHROPIC_API_KEY, officers 403.
 * No AI call is ever made: the key is forced empty below, so the setting stays OCR.
 * Own users and designations (domain e2e-v121.test), so it never touches the other e2e files.
 */
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  getOptionsToken,
  seconds,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { ThrottleIdentity } from '../src/common/throttling/throttle-identity';
import type { AppRequest } from '../src/common/types/auth-user';
import { hashPassword } from '../src/common/utils/password';
import type { EnvVars } from '../src/config/env.validation';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum';
import {
  docm,
  docxFromLines,
  renamedExe,
} from '../src/modules/decisions/docx.fixture-spec';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { Meeting } from '../src/modules/meetings/entities/meeting.entity';
import type { NoticeExtractResponseDto } from '../src/modules/notice-extract/dto/notice-extract.dto';
import { AppSetting } from '../src/modules/settings/entities/app-setting.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';

const API = '/api/v1';
const PASSWORD = 'E2ePass1234';
const DOMAIN = 'e2e-v121.test';
const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// YYA is stored as YA + NUKTA (SPEC.md §13.13): built from code points.
const Y = 'য়';

/** Made-up officers (anonymized); `chair` and `member` appear in the notice, `copy` only after "অনুলিপি". */
const NAMES = {
  chair: 'তানভীর মাহতাব চৌধুরী',
  member: 'ফারহানা নাসরিন ইসলাম',
  copy: 'রেজাউল করিম খান',
} as const;

/** One notice in our fixed format (structure of the real notice, every name and number made up). */
const NOTICE_LINES = [
  'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার',
  'পরিকল্পনা মন্ত্রণাল' + Y,
  'বাংলাদেশ পরিসংখ্যান ব্যুরো',
  'নং-৫২.০১.০০০০.৯৯৯.০১.০০১.২৬-৪৫৬ তারিখ: ০১ ডিসেম্বর ২০২৬',
  'সভার নোটিশ',
  `বাংলাদেশ পরিসংখ্যান ব্যুরো (বিবিএস) কর্তৃক বাস্তবা${Y}নাধীন পরীক্ষামূলক তথ্য ব্যবস্থাপনা প্রকল্পের একটি সভা নিম্নবর্ণিত সম${Y} অনুযা${Y}ী অনুষ্ঠিত হবে:`,
  `সভাপতি : জনাব ${NAMES.chair}, পরিচালক, পরীক্ষা উইং, বাংলাদেশ পরিসংখ্যান ব্যুরো`,
  `তারিখ ও সম${Y} : ১০ ডিসেম্বর, ২০২৬; সকাল ১০.৩০ ঘটিকা`,
  'স্থান : সম্মেলন কক্ষ, বিবিএস, ঢাকা-১২০৭',
  'আলোচ্যসূচি : ক) প্রকল্পের অগ্রগতি পর্যালোচনা;',
  'খ) বিবিধ;',
  `২। সভা${Y} সংশ্লিষ্ট সকলকে যথাসম${Y}ে উপস্থিত থাকার জন্য অনুরোধ করা হলো।`,
  '(মোঃ করিম উদ্দিন)',
  'সিনিয়র সিস্টেম এনালিস্ট',
  `বিতরণ: সদ${Y} কার্যার্থে (জ্যেষ্ঠতার ক্রমানুসারে ন${Y}):-`,
  `১. জনাব ${NAMES.member}, উপপরিচালক, পরীক্ষা উইং, বিবিএস, আগারগাঁও, ঢাকা।`,
  '২. জনাব শহিদুল আলম, সিস্টেম এনালিস্ট, বিবিএস, ঢাকা।',
  '৩. কর্মকর্তা (সকল), পরীক্ষামূলক তথ্য ব্যবস্থাপনা প্রকল্প, বিবিএস, ঢাকা-১২০৭',
  `অনুলিপি: সদ${Y} জ্ঞাতার্থে:`,
  `১. জনাব ${NAMES.copy}, পরিচালক, বিবিএস, ঢাকা।`,
  '২. অফিস কপি।',
];
const NOTICE = docxFromLines(NOTICE_LINES);

type Who =
  'org' | 'heavy' | 'admin' | 'super' | 'chair' | 'member' | 'copy' | 'other';

describe('v1.21: fill the meeting form from the notice + app settings (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const ids = {} as Record<Who, string>;
  const tokens: Partial<Record<Who, string>> = {};

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` });
  const extract = (
    who: Who,
    bytes: Buffer,
    name = 'নোটিশ.docx',
    type = DOCX_TYPE,
  ) =>
    http()
      .post(`${API}/meetings/notice-extract`)
      .set(as(who))
      .attach('file', bytes, { filename: name, contentType: type });

  beforeAll(async () => {
    // No AI in tests (no real Anthropic call, ever): the key is empty whatever .env says.
    process.env.ANTHROPIC_API_KEY = '';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // The app skips every rate limit under NODE_ENV=test. Here the SAME throttler options as
      // app.module.ts are used, only without that skip, so the real 20-per-day limit is tested.
      .overrideProvider(getOptionsToken())
      .useFactory({
        inject: [ConfigService],
        factory: (
          config: ConfigService<EnvVars, true>,
        ): ThrottlerModuleOptions => {
          const identity = new ThrottleIdentity(
            config.get('JWT_ACCESS_SECRET', { infer: true }),
            {
              perIp: config.get('THROTTLE_LIMIT', { infer: true }),
              perUser: config.get('THROTTLE_USER_LIMIT', { infer: true }),
            },
          );
          return {
            throttlers: [
              {
                name: 'default',
                ttl: seconds(60),
                limit: (context) => identity.limitFor(context),
              },
            ],
            getTracker: (req, context) =>
              identity.trackerFor(req as AppRequest, context),
          };
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    expect(ds.options.database).toMatch(/_test$/);

    const designation = async (nameEn: string, priority: number) =>
      (
        await ds
          .getRepository(Designation)
          .insert({ nameBn: `পদবি ${nameEn}`, nameEn, priority })
      ).identifiers[0].id as string;
    const director = await designation('V121 Director', 4);
    const officer = await designation('V121 Officer', 7);
    const passwordHash = await hashPassword(PASSWORD);
    const people: Array<[Who, string, string | null, UserRole]> = [
      ['org', `আ${Y}োজক পরীক্ষা`, officer, UserRole.OFFICER],
      ['heavy', 'সীমা পরীক্ষা কর্মকর্তা', officer, UserRole.OFFICER],
      ['other', 'অন্য পরীক্ষা কর্মকর্তা', officer, UserRole.OFFICER],
      ['admin', 'প্রশাসক পরীক্ষা', officer, UserRole.ADMIN],
      ['super', 'Super Admin V121', null, UserRole.SUPER_ADMIN],
      ['chair', NAMES.chair, director, UserRole.OFFICER],
      ['member', NAMES.member, officer, UserRole.OFFICER],
      ['copy', NAMES.copy, director, UserRole.OFFICER],
    ];
    for (const [who, nameBn, designationId, role] of people) {
      ids[who] = (
        await ds.getRepository(User).insert({
          loginEmail: `${who}@${DOMAIN}`,
          notificationEmail: `${who}@${DOMAIN}`,
          passwordHash,
          nameBn,
          nameEn: `V121 ${who}`,
          designationId,
          role,
          mustChangePassword: false,
        })
      ).identifiers[0].id as string;
    }
    // Login is limited to 10 per minute per IP (real limits are on here): only who needs a token.
    for (const who of ['org', 'heavy', 'other', 'admin', 'super'] as const) {
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ loginEmail: `${who}@${DOMAIN}`, password: PASSWORD })
        .expect(200);
      tokens[who] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /meetings/notice-extract: who and which files', () => {
    it('SUPER_ADMIN cannot use it (403, the "cannot organize" message)', async () => {
      const res = await extract('super', NOTICE).expect(403);
      expect((res.body as { message: string }).message).toContain(
        'Super Admin',
      );
    });

    it('a file of the wrong type is rejected by its bytes (400), also when named .docx', async () => {
      const txt = await extract(
        'org',
        Buffer.from('শুধু লেখা, কোনো নোটিশ ফাইল ন' + Y),
        'notice.txt',
        'text/plain',
      ).expect(400);
      expect((txt.body as { message: string }).message).toContain(
        'শুধু PDF, DOCX, JPEG অথবা PNG',
      );
      await extract('org', renamedExe(), 'notice.docx').expect(400);
    });

    it('a macro-enabled Word file (400) and no file at all (400)', async () => {
      await extract('org', docm(), 'notice.docx').expect(400);
      await http()
        .post(`${API}/meetings/notice-extract`)
        .set(as('org'))
        .expect(400);
    });
  });

  describe('a DOCX notice in our fixed format', () => {
    let body: NoticeExtractResponseDto;
    let meetingsBefore: number;

    beforeAll(async () => {
      meetingsBefore = await ds.getRepository(Meeting).count();
      body = (await extract('org', NOTICE).expect(200))
        .body as NoticeExtractResponseDto;
    });

    it('reads the form fields with the local OCR method (text of the DOCX)', () => {
      expect(body.method).toBe('OCR');
      expect(body.fields).toEqual({
        title: 'পরীক্ষামূলক তথ্য ব্যবস্থাপনা প্রকল্পের সভা',
        date: '2026-12-10',
        startTime: '10:30',
        endTime: '11:15',
        venue: 'সম্মেলন কক্ষ, বিবিএস, ঢাকা-১২০৭',
        agenda: expect.stringMatching(
          /^ক\) প্রকল্পের অগ্রগতি পর্যালোচনা;?\nখ\) বিবিধ;?$/,
        ) as string,
      });
      expect(body.warnings.map((w) => w.code)).not.toContain(
        'TIME_ASSUMED_AFTERNOON',
      );
    });

    it('matches the chair to our officer', () => {
      expect(body.chair?.status).toBe('sure');
      expect(body.chair?.match?.officer.id).toBe(ids.chair);
    });

    it('matches the distribution list: sure, not found, group; "অনুলিপি" ignored', () => {
      const { sure, maybe, unmatched } = body.participants;
      expect(sure.map((s) => s.match.officer.id)).toEqual([ids.member]);
      expect(maybe).toEqual([]);
      expect(unmatched.map((u) => u.reason).sort()).toEqual([
        'group',
        'not-found',
      ]);
      expect(unmatched.find((u) => u.reason === 'not-found')?.name).toBe(
        'শহিদুল আলম',
      );
      const all = JSON.stringify(body);
      expect(all).not.toContain(NAMES.copy);
      expect(all).not.toContain(ids.copy);
      expect(all).not.toContain('অফিস কপি');
      expect(all).not.toContain('করিম উদ্দিন');
    });

    it('stores nothing and audits only method / success / duration', async () => {
      expect(await ds.getRepository(Meeting).count()).toBe(meetingsBefore);
      const [entry] = await ds.getRepository(AuditLog).find({
        where: { action: AuditAction.NOTICE_EXTRACTED, actorId: ids.org },
        order: { createdAt: 'DESC' },
        take: 1,
      });
      expect(entry.entityId).toBeNull();
      expect(Object.keys(entry.after ?? {}).sort()).toEqual([
        'durationMs',
        'method',
        'success',
      ]);
      expect(entry.after).toMatchObject({ method: 'OCR', success: true });
      expect(JSON.stringify(entry)).not.toContain('নোটিশ.docx');
      expect(JSON.stringify(entry)).not.toContain('সম্মেলন কক্ষ');
    });
  });

  describe('rate limit: 20 per user per day', () => {
    it('the 21st call of the same user gets 429; another user is not affected', async () => {
      for (let i = 0; i < 20; i++) await extract('heavy', NOTICE).expect(200);
      await extract('heavy', NOTICE).expect(429);
      await extract('other', NOTICE).expect(200);
    });
  });

  describe('GET / PATCH /admin/settings', () => {
    const settings = (who: Who) =>
      http().get(`${API}/admin/settings`).set(as(who));
    const patch = (who: Who, value: unknown) =>
      http()
        .patch(`${API}/admin/settings`)
        .set(as(who))
        .send({ noticeExtractionMethod: value });

    it('default: OCR, AI not available (no key); the key is never returned', async () => {
      const res = await settings('admin').expect(200);
      expect(res.body).toEqual({
        noticeExtractionMethod: 'OCR',
        aiAvailable: false,
      });
      await settings('super').expect(200);
    });

    it('AI is refused without a key (400 "API key সেট করা নেই।"); nothing changes', async () => {
      const res = await patch('admin', 'AI').expect(400);
      expect(JSON.stringify(res.body)).toContain('API key সেট করা নেই।');
      expect((await settings('admin').expect(200)).body).toMatchObject({
        noticeExtractionMethod: 'OCR',
      });
      expect(await ds.getRepository(AppSetting).count()).toBe(0);
      expect(
        await ds
          .getRepository(AuditLog)
          .countBy({ action: AuditAction.SETTING_CHANGED }),
      ).toBe(0);
    });

    it('an invalid value is rejected (400); OCR is accepted (200)', async () => {
      await patch('admin', 'GPT').expect(400);
      await patch('admin', 'OCR').expect(200);
    });

    it('officers cannot read or change the settings (403)', async () => {
      await settings('org').expect(403);
      await patch('org', 'OCR').expect(403);
    });
  });
});
