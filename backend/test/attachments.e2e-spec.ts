/**
 * Release v1.17 part 2 e2e on the TEST database: the other attachments "অন্যান্য সংযুক্তি"
 * (SPEC.md §6.11): only the organizer adds and removes (chair, member and admin 403); the meeting's
 * people and admins list and download (others 403), also after a cancel; label required (max 150);
 * at most 5; PDF inline, DOCX attachment; audited; private storage in
 * DECISION_UPLOAD_DIR/attachments/<meetingId>/.
 * Own users, designations and days (170+), so it never touches the other e2e files.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/common/utils/password';
import { MeetingAttachment } from '../src/modules/attachments/entities/meeting-attachment.entity';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum';
import { DecisionStorageService } from '../src/modules/decisions/decision-storage.service';
import { docm, docx } from '../src/modules/decisions/docx.fixture-spec';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';

const API = '/api/v1';
const PASSWORD = 'E2ePass1234';
const ZONE = 'Asia/Dhaka';
const DOMAIN = 'e2e-v117b.test';
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
  'latin1',
);
const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Who = 'org' | 'chair' | 'member' | 'stranger' | 'admin';

interface Item {
  id: string;
  name: string;
  originalName: string;
  mime: string;
  size: number;
}
interface List {
  items: Item[];
  canManage: boolean;
  max: number;
}

function slot(offset: number, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return DateTime.now()
    .setZone(ZONE)
    .startOf('day')
    .plus({ days: offset })
    .set({ hour: h, minute: m })
    .toISO({ suppressMilliseconds: true })!;
}

describe('v1.17: other attachments of a meeting (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let storageRoot: string;
  const ids = {} as Record<Who, string>;
  const tokens = {} as Record<Who, string>;

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` });
  const base = (id: string) => `${API}/meetings/${id}/attachments`;
  const add = (
    who: Who,
    id: string,
    label: string | null,
    filename: string,
    bytes: Buffer,
    type = 'application/pdf',
  ) => {
    const req = http().post(base(id)).set(as(who));
    if (label !== null) req.field('name', label);
    return req.attach('file', bytes, { filename, contentType: type });
  };
  const list = async (who: Who, id: string) =>
    (await http().get(base(id)).set(as(who)).expect(200)).body as List;
  const binary = (req: request.Test) =>
    req.buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
  const audits = (action: AuditAction, entityId: string) =>
    ds.getRepository(AuditLog).findBy({ action, entityId });

  async function meeting(offset: number, title: string): Promise<string> {
    const res = await http()
      .post(`${API}/meetings`)
      .set(as('org'))
      .send({
        title,
        startAt: slot(offset, '10:00'),
        endAt: slot(offset, '11:00'),
        room: 'সম্মেলন কক্ষ',
        chairId: ids.chair,
        participantIds: [ids.member],
      })
      .expect(201);
    return (res.body as { id: string }).id;
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
    storageRoot = app.get(DecisionStorageService).root;

    const designation = async (nameEn: string, priority: number) =>
      (
        await ds
          .getRepository(Designation)
          .insert({ nameBn: `পদবি ${nameEn}`, nameEn, priority })
      ).identifiers[0].id as string;
    const director = await designation('V117B Director', 4);
    const officer = await designation('V117B Officer', 7);
    const passwordHash = await hashPassword(PASSWORD);
    const people: Array<[Who, string, UserRole]> = [
      ['org', officer, UserRole.OFFICER],
      ['chair', director, UserRole.OFFICER],
      ['member', officer, UserRole.OFFICER],
      ['stranger', officer, UserRole.OFFICER],
      ['admin', officer, UserRole.ADMIN],
    ];
    for (const [who, designationId, role] of people) {
      ids[who] = (
        await ds.getRepository(User).insert({
          loginEmail: `${who}@${DOMAIN}`,
          notificationEmail: `${who}@${DOMAIN}`,
          passwordHash,
          nameBn: `কর্মকর্তা ${who}`,
          nameEn: `V117B ${who}`,
          designationId,
          role,
          mustChangePassword: false,
        })
      ).identifiers[0].id as string;
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ loginEmail: `${who}@${DOMAIN}`, password: PASSWORD });
      tokens[who] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('add, list, download, remove', () => {
    let id: string;
    let pdfId: string;

    beforeAll(async () => {
      id = await meeting(170, 'সংযুক্তি পরীক্ষা সভা');
    });

    it('empty list; canManage only for the organizer; stranger 403', async () => {
      expect(await list('org', id)).toEqual({
        items: [],
        canManage: true,
        max: 5,
      });
      expect((await list('chair', id)).canManage).toBe(false);
      expect((await list('admin', id)).canManage).toBe(false);
      await http().get(base(id)).set(as('stranger')).expect(403);
    });

    it.each(['chair', 'member', 'admin', 'stranger'] as const)(
      '%s cannot add (403)',
      async (who) => {
        await add(who, id, 'নাম', 'a.pdf', PDF).expect(403);
      },
    );

    it('the label is required and at most 150 characters (400)', async () => {
      await add('org', id, null, 'a.pdf', PDF).expect(400);
      await add('org', id, '   ', 'a.pdf', PDF).expect(400);
      await add('org', id, 'ক'.repeat(151), 'a.pdf', PDF).expect(400);
    });

    it('a fake PDF and a macro-enabled Word file are refused (400)', async () => {
      await add('org', id, 'নাম', 'x.pdf', Buffer.from('not a pdf')).expect(
        400,
      );
      await add('org', id, 'নাম', 'm.docx', docm(), DOCX_TYPE).expect(400);
    });

    it('the organizer adds a PDF (trimmed label): 201, stored privately, audited', async () => {
      const res = await add(
        'org',
        id,
        '  বাজেট   প্রস্তাব ',
        'budget.pdf',
        PDF,
      ).expect(201);
      const body = res.body as Item;
      expect(body).toMatchObject({
        name: 'বাজেট প্রস্তাব',
        originalName: 'budget.pdf',
        mime: 'application/pdf',
        size: PDF.length,
      });
      pdfId = body.id;
      const row = await ds
        .getRepository(MeetingAttachment)
        .findOneByOrFail({ id: pdfId });
      expect(row.storedName).toMatch(/^[0-9a-f-]{36}\.pdf$/);
      expect(
        existsSync(join(storageRoot, 'attachments', id, row.storedName)),
      ).toBe(true);
      const [entry] = await audits(AuditAction.MEETING_ATTACHMENT_ADDED, id);
      expect(entry.actorId).toBe(ids.org);
    });

    it('PDF inline, DOCX attachment, nosniff; stranger 403', async () => {
      const pdfRes = await binary(
        http()
          .get(`${base(id)}/${pdfId}`)
          .set(as('member')),
      ).expect(200);
      expect(pdfRes.headers['content-disposition']).toMatch(/^inline;/);
      expect(pdfRes.headers['x-content-type-options']).toBe('nosniff');
      expect(pdfRes.body).toEqual(PDF);

      const docRes = await add(
        'org',
        id,
        'চিঠি',
        'letter.docx',
        docx(),
        DOCX_TYPE,
      ).expect(201);
      const docId = (docRes.body as Item).id;
      const dl = await binary(
        http()
          .get(`${base(id)}/${docId}`)
          .set(as('admin')),
      ).expect(200);
      expect(dl.headers['content-disposition']).toMatch(/^attachment;/);
      await http()
        .get(`${base(id)}/${docId}`)
        .set(as('stranger'))
        .expect(403);
    });

    it('at most 5 (the 6th → 409)', async () => {
      for (let n = (await list('org', id)).items.length; n < 5; n++)
        await add('org', id, `ফাইল ${n}`, `f${n}.pdf`, PDF).expect(201);
      await add('org', id, 'ষষ্ঠ', 'six.pdf', PDF).expect(409);
    });

    it('only the organizer removes; audited; unknown id 404', async () => {
      await http()
        .delete(`${base(id)}/${pdfId}`)
        .set(as('chair'))
        .expect(403);
      await http()
        .delete(`${base(id)}/${pdfId}`)
        .set(as('org'))
        .expect(204);
      const [entry] = await audits(AuditAction.MEETING_ATTACHMENT_REMOVED, id);
      expect(entry.actorId).toBe(ids.org);
      await http()
        .delete(`${base(id)}/${pdfId}`)
        .set(as('org'))
        .expect(404);
    });

    it('cancelled: no add or remove (409), list and download still work', async () => {
      await http()
        .post(`${API}/meetings/${id}/cancel`)
        .set(as('org'))
        .send({ reason: 'পরীক্ষা' })
        .expect(200);
      await add('org', id, 'নাম', 'a.pdf', PDF).expect(409);
      const { items } = await list('member', id);
      await http()
        .delete(`${base(id)}/${items[0].id}`)
        .set(as('org'))
        .expect(409);
      await binary(
        http()
          .get(`${base(id)}/${items[0].id}`)
          .set(as('member')),
      ).expect(200);
    });
  });
});
