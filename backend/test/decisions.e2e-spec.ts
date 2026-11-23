/**
 * Release v1.11 e2e (SPEC.md §6.9) on the TEST database: meeting minutes ("সভা কার্যবিবরণী", named
 * "decisions" in v1.11). v1.13: DOCX minutes (always an attachment), macro / legacy .doc refused.
 * Upload, download (attachment / inline, safe headers), delete (→ Pending again), the lists and
 * counts, and every refusal: non-participants, admins uploading, before the start, cancelled,
 * fake files. Own users, designations, wing and days (90+). Files go to DECISION_UPLOAD_DIR
 * from .env.test.
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
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum';
import { DecisionStorageService } from '../src/modules/decisions/decision-storage.service';
import {
  docm,
  docx,
  legacyDoc,
} from '../src/modules/decisions/docx.fixture-spec';
import { MeetingDecisionFile } from '../src/modules/decisions/entities/meeting-decision-file.entity';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { Meeting } from '../src/modules/meetings/entities/meeting.entity';
import { Notification } from '../src/modules/notifications/entities/notification.entity';
import { NotificationType } from '../src/modules/notifications/enums/notification-type.enum';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';

const API = '/api/v1';
const PASSWORD = 'E2ePass1234';
const ZONE = 'Asia/Dhaka';
const DOMAIN = 'e2e-v111.test';
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
  'latin1',
);

type Who = 'org' | 'chair' | 'member' | 'member2' | 'stranger' | 'admin';

interface Detail {
  status: string | null;
  canUpload: boolean;
  uploadBlock: string | null;
  meeting: {
    id: string;
    decisionStatus: string | null;
    decisionFileCount: number;
  };
  files: Array<{
    id: string;
    originalName: string;
    mime: string;
    size: number;
    canDelete: boolean;
  }>;
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

describe('v1.11: meeting decisions (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let storageRoot: string;
  const ids = {} as Record<Who, string>;
  const tokens = {} as Record<Who, string>;

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` });
  const base = (id: string) => `${API}/meetings/${id}/decision`;
  const upload = (
    who: Who,
    id: string,
    name: string,
    bytes: Buffer,
    type = 'application/pdf',
  ) =>
    http()
      .post(`${base(id)}/files`)
      .set(as(who))
      .attach('files', bytes, { filename: name, contentType: type });
  const detail = async (who: Who, id: string) =>
    (await http().get(base(id)).set(as(who)).expect(200)).body as Detail;
  const binary = (req: request.Test) =>
    req.buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });

  /** A meeting org organizes, chair chairs, member + member2 attend; moved to the past if `started`. */
  async function meeting(offset: number, title: string, started = true) {
    const res = await http()
      .post(`${API}/meetings`)
      .set(as('org'))
      .send({
        title,
        startAt: slot(offset, '10:00'),
        endAt: slot(offset, '11:00'),
        room: 'সম্মেলন কক্ষ',
        chairId: ids.chair,
        participantIds: [ids.member, ids.member2],
      })
      .expect(201);
    const id = (res.body as { id: string }).id;
    if (started) {
      await ds.getRepository(Meeting).update(id, {
        startAt: DateTime.now().minus({ hours: 2 }).toJSDate(),
        endAt: DateTime.now().minus({ hours: 1 }).toJSDate(),
      });
    }
    return id;
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
    const director = await designation('V111 Director', 4);
    const officer = await designation('V111 Officer', 7);
    const passwordHash = await hashPassword(PASSWORD);
    const people: Array<[Who, string, UserRole]> = [
      ['org', officer, UserRole.OFFICER],
      ['chair', director, UserRole.OFFICER],
      ['member', officer, UserRole.OFFICER],
      ['member2', officer, UserRole.OFFICER],
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
          nameEn: `V111 ${who}`,
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

  describe('upload, download, delete', () => {
    let id: string;
    let fileId: string;

    beforeAll(async () => {
      id = await meeting(90, 'কার্যবিবরণী পরীক্ষা সভা');
    });

    it('starts Pending; the member may upload, the admin may only view', async () => {
      const d = await detail('member', id);
      expect(d.status).toBe('PENDING');
      expect(d.canUpload).toBe(true);
      const a = await detail('admin', id);
      expect(a.canUpload).toBe(false);
      expect(a.uploadBlock).toBe('forbidden');
    });

    it('a member uploads a PDF → Complete; organizer and chair get a bell notice (no mail)', async () => {
      const res = await upload(
        'member',
        id,
        'সভার কার্যবিবরণী.pdf',
        PDF,
      ).expect(201);
      const d = res.body as Detail;
      expect(d.status).toBe('COMPLETE');
      expect(d.files).toHaveLength(1);
      expect(d.files[0]).toMatchObject({
        originalName: 'সভার কার্যবিবরণী.pdf',
        mime: 'application/pdf',
        size: PDF.length,
        canDelete: true,
      });
      fileId = d.files[0].id;

      for (const who of ['org', 'chair'] as const) {
        const [n] = await ds.getRepository(Notification).findBy({
          userId: ids[who],
          type: NotificationType.MEETING_DECISION_UPLOADED,
        });
        expect(n.body).toBe(
          '"কার্যবিবরণী পরীক্ষা সভা" সভার কার্যবিবরণী আপলোড করা হয়েছে।',
        );
      }
      expect(
        await ds.getRepository(Notification).countBy({
          userId: ids.member,
          type: NotificationType.MEETING_DECISION_UPLOADED,
        }),
      ).toBe(0);
      const [entry] = await ds.getRepository(AuditLog).findBy({
        action: AuditAction.MEETING_DECISION_UPLOADED,
        entityId: id,
      });
      expect(entry.actorId).toBe(ids.member);

      // Stored privately under a random name in a folder per meeting.
      const row = await ds
        .getRepository(MeetingDecisionFile)
        .findOneByOrFail({ id: fileId });
      expect(row.storedName).toMatch(/^[0-9a-f-]{36}\.pdf$/);
      expect(existsSync(join(storageRoot, id, row.storedName))).toBe(true);
      expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('lists show the meeting with its decision status', async () => {
      const list = await http()
        .get(`${API}/meetings/${id}`)
        .set(as('member'))
        .expect(200);
      expect((list.body as Detail['meeting']).decisionStatus).toBe('COMPLETE');
    });

    it('download: same bytes, a PDF inline (v1.17) with a safe name, nosniff, no-store', async () => {
      const res = await binary(
        http()
          .get(`${base(id)}/files/${fileId}`)
          .set(as('chair')),
      ).expect(200);
      expect((res.body as Buffer).equals(PDF)).toBe(true);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.headers['content-disposition']).toMatch(
        /^inline; filename="[^"]+"; filename\*=UTF-8''/,
      );
      const inline = await binary(
        http()
          .get(`${base(id)}/files/${fileId}?inline=true`)
          .set(as('admin')),
      ).expect(200);
      expect(inline.headers['content-disposition']).toMatch(/^inline;/);
    });

    it('a non-participant gets 403 for view, download, upload and delete', async () => {
      await http().get(base(id)).set(as('stranger')).expect(403);
      await http()
        .get(`${base(id)}/files/${fileId}`)
        .set(as('stranger'))
        .expect(403);
      await upload('stranger', id, 'x.pdf', PDF).expect(403);
      await http()
        .delete(`${base(id)}/files/${fileId}`)
        .set(as('stranger'))
        .expect(403);
    });

    it('an admin cannot upload (403)', async () => {
      await upload('admin', id, 'x.pdf', PDF).expect(403);
    });

    it('a fake PDF is rejected (400) with the message in the request language', async () => {
      const bn = await upload(
        'member',
        id,
        'fake.pdf',
        Buffer.from('plain text'),
      ).expect(400);
      expect((bn.body as { code: string }).code).toBe('DECISION_FILE_BAD_TYPE');
      const en = await upload(
        'member',
        id,
        'fake.pdf',
        Buffer.from('plain text'),
      )
        .set('Accept-Language', 'en')
        .expect(400);
      expect((en.body as { message: string }).message).toBe(
        'The file "fake.pdf" was not accepted: only PDF, DOCX, JPEG or PNG files can be uploaded.',
      );
    });

    it('another member cannot delete the file (403)', async () => {
      await http()
        .delete(`${base(id)}/files/${fileId}`)
        .set(as('member2'))
        .expect(403);
    });

    it('the uploader deletes the last file → Pending again, file gone, audited', async () => {
      const row = await ds
        .getRepository(MeetingDecisionFile)
        .findOneByOrFail({ id: fileId });
      await http()
        .delete(`${base(id)}/files/${fileId}`)
        .set(as('member'))
        .expect(204);
      expect((await detail('org', id)).status).toBe('PENDING');
      expect(existsSync(join(storageRoot, id, row.storedName))).toBe(false);
      const [entry] = await ds.getRepository(AuditLog).findBy({
        action: AuditAction.MEETING_DECISION_DELETED,
        entityId: id,
      });
      expect(entry.actorId).toBe(ids.member);
      await http()
        .get(`${base(id)}/files/${fileId}`)
        .set(as('org'))
        .expect(404);
    });
  });

  describe('refusals by meeting state', () => {
    it('before the start → 409', async () => {
      const id = await meeting(91, 'ভবিষ্যতের সভা', false);
      expect((await detail('member', id)).uploadBlock).toBe('notStarted');
      await upload('member', id, 'x.pdf', PDF).expect(409);
    });

    it('cancelled → 409', async () => {
      const id = await meeting(92, 'বাতিল সভা');
      await http()
        .post(`${API}/meetings/${id}/cancel`)
        .set(as('org'))
        .send({ reason: 'পরীক্ষা' })
        .expect(200);
      expect((await detail('member', id)).status).toBeNull();
      await upload('member', id, 'x.pdf', PDF).expect(409);
    });
  });

  describe('v1.13: DOCX minutes', () => {
    const DOCX_TYPE =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    let id: string;

    beforeAll(async () => {
      id = await meeting(95, 'DOCX কার্যবিবরণী সভা');
    });

    it('a DOCX is accepted and always downloaded as an attachment (even with ?inline=true)', async () => {
      const bytes = docx();
      const res = await upload(
        'member',
        id,
        'minutes.docx',
        bytes,
        DOCX_TYPE,
      ).expect(201);
      const file = (res.body as Detail).files[0];
      expect(file).toMatchObject({
        originalName: 'minutes.docx',
        mime: DOCX_TYPE,
        size: bytes.length,
      });
      const dl = await binary(
        http()
          .get(`${base(id)}/files/${file.id}?inline=true`)
          .set(as('chair')),
      ).expect(200);
      expect(dl.headers['content-type']).toBe(DOCX_TYPE);
      expect(dl.headers['content-disposition']).toMatch(/^attachment;/);
      expect(dl.headers['x-content-type-options']).toBe('nosniff');
      expect((dl.body as Buffer).equals(bytes)).toBe(true);
    });

    it('a macro-enabled Word file is refused (400, macro message)', async () => {
      const res = await upload('member', id, 'minutes.docm', docm(), DOCX_TYPE)
        .set('Accept-Language', 'en')
        .expect(400);
      expect((res.body as { code: string }).code).toBe('DECISION_FILE_MACRO');
    });

    it('a legacy .doc is refused as the wrong type (400)', async () => {
      const res = await upload(
        'member',
        id,
        'old.doc',
        legacyDoc(),
        'application/msword',
      ).expect(400);
      expect((res.body as { code: string }).code).toBe(
        'DECISION_FILE_BAD_TYPE',
      );
    });
  });

  describe('lists and counts', () => {
    it('organizer: Pending / Complete counts and lists; member: only the Pending member list', async () => {
      const before = (
        await http().get(`${API}/decisions/summary`).set(as('org')).expect(200)
      ).body as { pending: number; complete: number };
      const pendingId = await meeting(93, 'অপেক্ষমাণ সভা');
      const doneId = await meeting(94, 'সম্পন্ন সিদ্ধান্ত সভা');
      await upload('chair', doneId, 'scan.pdf', PDF).expect(201);

      const after = (
        await http().get(`${API}/decisions/summary`).set(as('org')).expect(200)
      ).body as typeof before;
      expect(after.pending).toBe(before.pending + 1);
      expect(after.complete).toBe(before.complete + 1);

      const pending = await http()
        .get(`${API}/decisions?status=PENDING`)
        .set(as('chair'))
        .expect(200);
      const pendingIds = (
        pending.body as { items: Array<{ id: string }> }
      ).items.map((m) => m.id);
      expect(pendingIds).toContain(pendingId);
      expect(pendingIds).not.toContain(doneId);
      const complete = await http()
        .get(`${API}/decisions?status=COMPLETE`)
        .set(as('org'))
        .expect(200);
      expect(
        (complete.body as { items: Array<{ id: string }> }).items.map(
          (m) => m.id,
        ),
      ).toContain(doneId);

      const asMember = await http()
        .get(`${API}/decisions?as=member`)
        .set(as('member'))
        .expect(200);
      const memberIds = (
        asMember.body as { items: Array<{ id: string }> }
      ).items.map((m) => m.id);
      expect(memberIds).toContain(pendingId);
      expect(memberIds).not.toContain(doneId);
      const memberSummary = (
        await http()
          .get(`${API}/decisions/summary`)
          .set(as('member'))
          .expect(200)
      ).body as typeof before;
      expect(memberSummary).toEqual({ pending: 0, complete: 0 });
    });
  });
});
