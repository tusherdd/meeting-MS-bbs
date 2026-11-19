/**
 * v1.6 e2e (SPEC.md §13.14): API messages follow Accept-Language (en|bn, Bangla by default)
 * and always carry a stable `code`; PDF reports, emails and bell notifications stay Bangla
 * whatever the request language is.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In, Like } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MESSAGE_CATALOG } from '../src/common/i18n/message-catalog';
import { hashPassword } from '../src/common/utils/password';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { EmailOutbox } from '../src/modules/mail/entities/email-outbox.entity';
import { Meeting } from '../src/modules/meetings/entities/meeting.entity';
import { Notification } from '../src/modules/notifications/entities/notification.entity';
import { PdfService } from '../src/modules/reports/pdf/pdf.service';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';

const API = '/api/v1';
const PASSWORD = 'E2ePass1234';
const DOMAIN = 'e2e-lang.test';
const GUEST_DOMAIN = 'e2e-lang-guest.test';
const ZONE = 'Asia/Dhaka';
const BANGLA = /[ঀ-৿]/;

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  code: string;
  codes?: string[];
}

function binary(
  res: request.Response,
  cb: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

describe('v1.6: API language (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const tokens = {} as Record<'officer' | 'colleague', string>;
  const ids = {} as Record<'officer' | 'colleague', string>;
  const day = DateTime.now().setZone(ZONE).startOf('day').plus({ days: 33 });
  const at = (h: number) =>
    day.set({ hour: h }).toISO({ suppressMilliseconds: true })!;

  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof tokens, lang?: string) => ({
    Authorization: `Bearer ${tokens[who]}`,
    ...(lang ? { 'Accept-Language': lang } : {}),
  });

  async function cleanup(): Promise<void> {
    const users = await ds.getRepository(User).find({
      select: { id: true },
      where: { loginEmail: Like(`%@${DOMAIN}`) },
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length > 0) {
      await ds.getRepository(Meeting).delete({ organizerId: In(userIds) });
      await ds.getRepository(AuditLog).delete({ actorId: In(userIds) });
      await ds.getRepository(User).delete({ id: In(userIds) });
    }
    await ds.getRepository(EmailOutbox).delete({ to: Like(`%@${DOMAIN}`) });
    await ds
      .getRepository(EmailOutbox)
      .delete({ to: Like(`%@${GUEST_DOMAIN}`) });
    await ds.getRepository(Designation).delete({ nameEn: 'E2EL Designation' });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    expect(ds.options.database).toMatch(/_test$/);
    await cleanup();

    const designationId = (
      await ds.getRepository(Designation).insert({
        nameBn: 'ভাষা পদবি',
        nameEn: 'E2EL Designation',
        priority: 7,
      })
    ).identifiers[0].id as string;
    const passwordHash = await hashPassword(PASSWORD);
    for (const who of ['officer', 'colleague'] as const) {
      ids[who] = (
        await ds.getRepository(User).insert({
          loginEmail: `${who}@${DOMAIN}`,
          notificationEmail: `${who}@${DOMAIN}`,
          passwordHash,
          nameBn: `ভাষা ${who}`,
          nameEn: `E2EL ${who}`,
          designationId,
          role: UserRole.OFFICER,
          mustChangePassword: false,
        })
      ).identifiers[0].id as string;
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ loginEmail: `${who}@${DOMAIN}`, password: PASSWORD })
        .expect(200);
      tokens[who] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('error messages', () => {
    it('Bangla by default, English with Accept-Language: en; the code is the same', async () => {
      const bn = await http()
        .get(`${API}/meetings/not-a-uuid`)
        .set(as('officer'))
        .expect(400);
      expect(bn.body).toMatchObject({
        message: MESSAGE_CATALOG.INVALID_ID.bn,
        code: 'INVALID_ID',
      });
      for (const lang of ['en', 'en-US,en;q=0.9']) {
        const en = await http()
          .get(`${API}/meetings/not-a-uuid`)
          .set(as('officer', lang))
          .expect(400);
        expect(en.body).toMatchObject({
          message: 'Invalid ID.',
          code: 'INVALID_ID',
        });
      }
      const explicitBn = await http()
        .get(`${API}/meetings/not-a-uuid`)
        .set(as('officer', 'bn'))
        .expect(400);
      expect((explicitBn.body as ErrorBody).message).toBe(
        MESSAGE_CATALOG.INVALID_ID.bn,
      );
    });

    it('X-Lang wins over the browser Accept-Language (Safari)', async () => {
      const res = await http()
        .get(`${API}/meetings/not-a-uuid`)
        .set(as('officer', 'bn-BD,bn;q=0.9'))
        .set('X-Lang', 'en')
        .expect(400);
      expect(res.body).toMatchObject({
        message: 'Invalid ID.',
        code: 'INVALID_ID',
      });
    });

    it('validation lists are translated one by one, with `codes`', async () => {
      const res = await http()
        .post(`${API}/meetings`)
        .set(as('officer', 'en'))
        .send({})
        .expect(400);
      const body = res.body as ErrorBody;
      expect(Array.isArray(body.message)).toBe(true);
      expect(body.codes).toHaveLength((body.message as string[]).length);
      expect(body.code).toBe(body.codes![0]);
      for (const m of body.message as string[])
        expect(BANGLA.test(m)).toBe(false);
      expect(body.codes).not.toContain('HTTP_400');
    });

    it('login failure has the same meaning in both languages', async () => {
      const wrong = { loginEmail: `officer@${DOMAIN}`, password: 'Wrong12345' };
      const bn = await http().post(`${API}/auth/login`).send(wrong).expect(401);
      const en = await http()
        .post(`${API}/auth/login`)
        .set('Accept-Language', 'en')
        .send(wrong)
        .expect(401);
      expect(bn.body).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: MESSAGE_CATALOG.INVALID_CREDENTIALS.bn,
      });
      expect(en.body).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: MESSAGE_CATALOG.INVALID_CREDENTIALS.en,
      });
    });
  });

  describe('always Bangla', () => {
    it('notifications and emails stay Bangla when the request is English', async () => {
      const res = await http()
        .post(`${API}/meetings`)
        .set(as('officer', 'en'))
        .send({
          title: 'ভাষা পরীক্ষার সভা',
          startAt: at(10),
          endAt: at(11),
          room: 'সম্মেলন কক্ষ',
          participantIds: [ids.colleague],
          guests: [
            {
              name: 'অতিথি',
              designation: 'পরামর্শক',
              email: `guest@${GUEST_DOMAIN}`,
            },
          ],
        })
        .expect(201);
      const meetingId = (res.body as { id: string }).id;

      const notes = await ds
        .getRepository(Notification)
        .findBy({ userId: ids.colleague });
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) {
        expect(BANGLA.test(n.title)).toBe(true);
        expect(BANGLA.test(n.body)).toBe(true);
      }

      const mails = await ds
        .getRepository(EmailOutbox)
        .findBy([
          { to: `colleague@${DOMAIN}` },
          { to: `guest@${GUEST_DOMAIN}` },
        ]);
      expect(mails.map((m) => m.to).sort()).toEqual(
        [`colleague@${DOMAIN}`, `guest@${GUEST_DOMAIN}`].sort(),
      );
      for (const m of mails) {
        expect(BANGLA.test(m.subject)).toBe(true);
        if (m.html) expect(m.html).toContain('<html lang="bn">');
        // v1.7: officer and designation names in mails are the Bangla ones, never the English.
        // v1.9: the organizer is shown as the wing (none here → the Bangla designation).
        const content = `${m.subject}\n${m.html ?? ''}\n${m.text ?? ''}`;
        expect(content).toContain('আয়োজক: ভাষা পদবি');
        expect(content).not.toContain('ভাষা officer');
        expect(content).not.toContain('E2EL');
      }
      for (const n of notes)
        expect(`${n.title} ${n.body}`).not.toContain('E2EL');

      // The bell list through the API is Bangla too.
      const list = await http()
        .get(`${API}/notifications`)
        .set(as('colleague', 'en'))
        .expect(200);
      const items = (list.body as { items: { title: string }[] }).items;
      expect(items.length).toBeGreaterThan(0);
      for (const i of items) expect(BANGLA.test(i.title)).toBe(true);
      expect(meetingId).toBeTruthy();
    });

    it('a PDF report asked for with Accept-Language: en is Bangla', async () => {
      const pdf = app.get(PdfService);
      const spy = jest.spyOn(pdf, 'render');
      try {
        const res = await http()
          .get(`${API}/reports/me/pdf`)
          .query({ period: 'day', date: day.toFormat('yyyy-MM-dd') })
          .set(as('officer', 'en'))
          .buffer(true)
          .parse(binary)
          .expect(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
        expect(spy).toHaveBeenCalledTimes(1);
        const html = spy.mock.calls[0][0];
        expect(html).toContain('<html lang="bn">');
        expect(html).toContain('দৈনিক কর্মসূচি');
        expect(html).not.toMatch(/Total meetings|Meeting report/i);
        // v1.7: the PDF prints the Bangla officer name and designation only.
        expect(html).toContain('জনাব ভাষা officer');
        expect(html).not.toContain('E2EL');
      } finally {
        spy.mockRestore();
      }
    }, 60_000);
  });

  describe('v1.7: English names in data responses', () => {
    it('meetings, reports and the profile carry both the Bangla and the English names', async () => {
      const list = await http()
        .get(`${API}/meetings`)
        .query({ from: at(0), to: at(23) })
        .set(as('colleague', 'en'))
        .expect(200);
      const items = (
        list.body as { items: Array<{ id: string; organizer: object }> }
      ).items;
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].organizer).toMatchObject({
        nameBn: 'ভাষা officer',
        nameEn: 'E2EL officer',
        designation: { nameBn: 'ভাষা পদবি', nameEn: 'E2EL Designation' },
      });

      const report = await http()
        .get(`${API}/reports/me`)
        .query({ period: 'day', date: day.toFormat('yyyy-MM-dd') })
        .set(as('officer', 'en'))
        .expect(200);
      expect(report.body).toMatchObject({
        officer: {
          nameBn: 'ভাষা officer',
          nameEn: 'E2EL officer',
          designationBn: 'ভাষা পদবি',
          designationEn: 'E2EL Designation',
        },
        meetings: {
          items: [
            expect.objectContaining({
              organizerNameBn: 'ভাষা officer',
              organizerNameEn: 'E2EL officer',
              organizerDesignationEn: 'E2EL Designation',
            }),
          ],
        },
      });
    });

    it('an English name with Bangla letters is refused (400, NAME_EN_LATIN)', async () => {
      const res = await http()
        .patch(`${API}/profile`)
        .set(as('officer', 'en'))
        .send({ nameEn: 'ভাষা' })
        .expect(400);
      expect((res.body as ErrorBody).codes).toContain('NAME_EN_LATIN');
    });
  });

  describe('success messages', () => {
    it('logout answers in the request language with a code', async () => {
      const res = await http()
        .post(`${API}/auth/logout`)
        .set(as('colleague', 'en'))
        .expect(200);
      expect(res.body).toEqual({
        message: MESSAGE_CATALOG.LOGGED_OUT.en,
        code: 'LOGGED_OUT',
      });
    });
  });
});
