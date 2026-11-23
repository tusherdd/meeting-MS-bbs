/**
 * v1.15 office report "অফিস রিপোর্ট" (SPEC.md §6.10): scope per designation (NONE / WING / OFFICE),
 * admins always OFFICE, an additional charge naming a designation, and the server-side checks on
 * the report, the PDF, the meeting detail, the notice and the minutes.
 * Runs on the TEST database; Puppeteer renders a real PDF once.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/common/utils/password';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { OfficeReportScope } from '../src/modules/designations/enums/office-report-scope.enum';
import { PdfService } from '../src/modules/reports/pdf/pdf.service';
import { UserAdditionalCharge } from '../src/modules/users/entities/user-additional-charge.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import { Wing } from '../src/modules/wings/entities/wing.entity';

const API = '/api/v1';
const PASSWORD = 'E2ePass1234';
const ZONE = 'Asia/Dhaka';

type Who =
  | 'admin'
  | 'dg'
  | 'director'
  | 'directorNoWing'
  | 'officer'
  | 'charged'
  | 'w1member'
  | 'w2org'
  | 'dirExtra';

function binary(
  res: request.Response,
  cb: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

describe('Office report scope (v1.15, e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const tokens = {} as Record<Who, string>;
  const ids = {} as Record<Who, string>;
  const wings = {} as Record<'w1' | 'w2', string>;
  const meetings = {} as Record<'A' | 'B' | 'C', string>;
  // A day 33 days ahead (Dhaka), only used by this file.
  const day = DateTime.now().setZone(ZONE).startOf('day').plus({ days: 33 });
  const date = day.toFormat('yyyy-MM-dd');
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return day
      .set({ hour: h, minute: m })
      .toISO({ suppressMilliseconds: true })!;
  };
  const range = { from: date, to: date };

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` });
  const office = (who: Who, query: Record<string, string> = {}) =>
    http()
      .get(`${API}/reports/office`)
      .query({ ...range, ...query })
      .set(as(who));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    expect(ds.options.database).toMatch(/_test$/);

    const designation = async (
      nameBn: string,
      nameEn: string,
      officeReportScope: OfficeReportScope,
    ) =>
      (
        await ds.getRepository(Designation).insert({
          nameBn,
          nameEn,
          priority: 4,
          officeReportScope,
        })
      ).identifiers[0].id as string;
    const dOffice = await designation(
      'অফিস-পরীক্ষা মহাপরিচালক',
      'E2EOR Director General',
      OfficeReportScope.OFFICE,
    );
    const dWing = await designation(
      'অফিস-পরীক্ষা পরিচালক',
      'E2EOR Director',
      OfficeReportScope.WING,
    );
    const dNone = await designation(
      'অফিস-পরীক্ষা কর্মকর্তা',
      'E2EOR Officer',
      OfficeReportScope.NONE,
    );
    for (const [key, nameBn, nameEn] of [
      ['w1', 'অফিস-পরীক্ষা উইং এক', 'E2EOR Wing One'],
      ['w2', 'অফিস-পরীক্ষা উইং দুই', 'E2EOR Wing Two'],
    ] as const) {
      wings[key] = (await ds.getRepository(Wing).insert({ nameBn, nameEn }))
        .identifiers[0].id as string;
    }

    const passwordHash = await hashPassword(PASSWORD);
    const people: Array<[Who, string, string | null, UserRole]> = [
      ['admin', dNone, wings.w1, UserRole.ADMIN],
      ['dg', dOffice, wings.w1, UserRole.OFFICER],
      ['director', dWing, wings.w1, UserRole.OFFICER],
      ['directorNoWing', dWing, null, UserRole.OFFICER],
      ['officer', dNone, wings.w1, UserRole.OFFICER],
      ['charged', dNone, wings.w2, UserRole.OFFICER],
      ['w1member', dNone, wings.w1, UserRole.OFFICER],
      ['w2org', dNone, wings.w2, UserRole.OFFICER],
      ['dirExtra', dWing, wings.w1, UserRole.OFFICER],
    ];
    for (const [who, designationId, wingId, role] of people) {
      const email = `${who.toLowerCase()}@e2e-office.test`;
      ids[who] = (
        await ds.getRepository(User).insert({
          loginEmail: email,
          notificationEmail: email,
          passwordHash,
          nameBn: `অফিস ${who}`,
          nameEn: `E2EOR ${who}`,
          designationId,
          wingId,
          role,
          mustChangePassword: false,
        })
      ).identifiers[0].id as string;
    }
    // v1.16 structured additional charges:
    // - an OFFICE-scope designation as a charge → OFFICE;
    // - a WING-scope charge with its own wing → that wing too;
    // - a migrated row that still needs review → counts for nothing (even if its text names the DG).
    await ds.getRepository(UserAdditionalCharge).insert([
      { userId: ids.charged, designationId: dOffice, note: 'চলতি দায়িত্ব' },
      { userId: ids.dirExtra, designationId: dWing, wingId: wings.w2 },
      {
        userId: ids.officer,
        designationId: null,
        note: 'অফিস-পরীক্ষা মহাপরিচালক',
        needsReview: true,
      },
    ]);
    for (const [who] of people) {
      const res = await http()
        .post(`${API}/auth/login`)
        .send({
          loginEmail: `${who.toLowerCase()}@e2e-office.test`,
          password: PASSWORD,
        })
        .expect(200);
      tokens[who] = (res.body as { accessToken: string }).accessToken;
    }

    const make = async (
      who: Who,
      start: string,
      end: string,
      title: string,
      participantIds: string[] = [],
    ) =>
      (
        (
          await http()
            .post(`${API}/meetings`)
            .set(as(who))
            .send({
              title,
              startAt: at(start),
              endAt: at(end),
              room: 'কক্ষ ১',
              participantIds,
            })
            .expect(201)
        ).body as { id: string }
      ).id;
    // A: organized in wing 2 with a wing-1 member; B: wing 2 only; C: wing 1 (the director).
    meetings.A = await make('w2org', '09:00', '10:00', 'সভা A', [ids.w1member]);
    meetings.B = await make('w2org', '11:00', '12:00', 'সভা B');
    meetings.C = await make('director', '13:00', '14:00', 'সভা C');
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('/auth/me tells the scope: designation, admin, additional charge', async () => {
    const scope = async (who: Who) =>
      (
        (await http().get(`${API}/auth/me`).set(as(who)).expect(200)).body as {
          officeReportScope: string;
        }
      ).officeReportScope;
    expect(await scope('officer')).toBe('NONE');
    expect(await scope('director')).toBe('WING');
    expect(await scope('dg')).toBe('OFFICE');
    expect(await scope('admin')).toBe('OFFICE');
    expect(await scope('charged')).toBe('OFFICE');
  });

  it('NONE → 403 on the report and the PDF', async () => {
    const res = await office('officer').expect(403);
    expect(res.body).toMatchObject({ code: 'OFFICE_REPORT_FORBIDDEN' });
    await http()
      .get(`${API}/reports/office/pdf`)
      .query(range)
      .set(as('officer'))
      .expect(403);
  });

  it('OFFICE (DG, admin, charge): every wing; wing list by the organizer’s wing', async () => {
    for (const who of ['dg', 'admin', 'charged'] as const) {
      const res = await office(who).expect(200);
      const body = res.body as {
        scope: string;
        wings: Array<{ id: string; meetings: number }> | null;
      };
      expect(body.scope).toBe('OFFICE');
      const mine = (body.wings ?? []).filter((w) =>
        [wings.w1, wings.w2].includes(w.id),
      );
      expect(mine).toEqual([
        expect.objectContaining({ id: wings.w2, meetings: 2 }),
        expect.objectContaining({ id: wings.w1, meetings: 1 }),
      ]);
    }
    // A chosen wing: only meetings organized there; the wing list is hidden.
    const w2 = await office('dg', { wingId: wings.w2 }).expect(200);
    expect(w2.body).toMatchObject({
      wing: { id: wings.w2 },
      wings: null,
      cards: { total: 2 },
    });
    // OFFICE viewers open any meeting read-only.
    const detail = await http()
      .get(`${API}/meetings/${meetings.B}`)
      .set(as('dg'))
      .expect(200);
    expect(detail.body).toMatchObject({ myRole: null });
  });

  it('WING (director): own wing only, locked; an own-wing officer shows their meetings in other wings', async () => {
    const res = await office('director').expect(200);
    expect(res.body).toMatchObject({
      scope: 'WING',
      wing: { id: wings.w1 },
      wings: null,
      cards: { total: 1 },
      filterOptions: { organizerWings: [] },
    });
    // Officer of the own wing → their meeting A, organized in wing 2, with the ভূমিকা.
    const member = await office('director', { officerId: ids.w1member }).expect(
      200,
    );
    expect(member.body).toMatchObject({
      officer: { id: ids.w1member },
      cards: { total: 1 },
      meetings: { items: [{ id: meetings.A, officerRole: 'MEMBER' }] },
    });
    // Top 5: only officers of the own wing.
    const top = (member.body as { topParticipants: Array<{ userId: string }> })
      .topParticipants;
    expect(top.map((t) => t.userId)).toEqual([ids.w1member]);

    // Outside the scope → 403.
    const outside: Array<Record<string, string>> = [
      { wingId: wings.w2 },
      { officerId: ids.w2org },
      { organizerWingId: wings.w2 },
    ];
    for (const query of outside) {
      const r = await office('director', query).expect(403);
      expect(r.body).toMatchObject({ code: 'OFFICE_REPORT_OUT_OF_SCOPE' });
    }
    await http()
      .get(`${API}/reports/office/pdf`)
      .query({ ...range, officerId: ids.w2org })
      .set(as('director'))
      .expect(403);
  });

  it('WING: meeting detail, notice and minutes only for meetings in scope (read-only)', async () => {
    // A has a wing-1 member → visible; B is wing 2 only → hidden.
    await http()
      .get(`${API}/meetings/${meetings.A}`)
      .set(as('director'))
      .expect(200);
    await http()
      .get(`${API}/meetings/${meetings.B}`)
      .set(as('director'))
      .expect(404);
    // Notice: in scope → "no notice" (404 NOTICE_NOT_FOUND); out of scope → 403.
    const noticeA = await http()
      .get(`${API}/meetings/${meetings.A}/notice`)
      .set(as('director'))
      .expect(404);
    expect(noticeA.body).toMatchObject({ code: 'NOTICE_NOT_FOUND' });
    await http()
      .get(`${API}/meetings/${meetings.B}/notice`)
      .set(as('director'))
      .expect(403);
    // Minutes: view only (no upload) in scope; 403 outside.
    const minutes = await http()
      .get(`${API}/meetings/${meetings.A}/decision`)
      .set(as('director'))
      .expect(200);
    expect(minutes.body).toMatchObject({ canUpload: false });
    await http()
      .get(`${API}/meetings/${meetings.B}/decision`)
      .set(as('director'))
      .expect(403);
    // NONE officers still see nothing of other people's meetings.
    await http()
      .get(`${API}/meetings/${meetings.A}`)
      .set(as('officer'))
      .expect(404);
    await http()
      .get(`${API}/meetings/${meetings.A}/decision`)
      .set(as('officer'))
      .expect(403);
  });

  it('WING without a wing → 403 with a clear message', async () => {
    const res = await office('directorNoWing').expect(403);
    expect(res.body).toMatchObject({ code: 'OFFICE_REPORT_NO_WING' });
  });

  it('PDF = exactly the rows on screen (same filters and page); audited', async () => {
    const query = { ...range, wingId: wings.w2, page: '2', limit: '1' };
    const screen = await office('dg', query).expect(200);
    const items = (
      screen.body as { meetings: { items: Array<{ title: string }> } }
    ).meetings.items;
    expect(items.map((i) => i.title)).toEqual(['সভা B']);

    const spy = jest.spyOn(app.get(PdfService), 'render');
    const pdf = await http()
      .get(`${API}/reports/office/pdf`)
      .query(query)
      .set(as('dg'))
      .buffer(true)
      .parse(binary)
      .expect(200);
    const html = spy.mock.calls[0][0];
    spy.mockRestore();
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(html).toContain('বাংলাদেশ পরিসংখ্যান ব্যুরো — অফিস রিপোর্ট');
    expect(html).toContain('<td>জনাব অফিস dg</td>');
    expect(html).toContain('<td>অফিস-পরীক্ষা উইং দুই</td>');
    expect(html).toContain('সভা B');
    expect(html).not.toContain('সভা A');
    expect(html).not.toContain('সভা C');
    expect(pdf.headers['content-disposition']).toBe(
      `inline; filename="office-report-${date}_${date}.pdf"`,
    );
    const audit = await ds.getRepository(AuditLog).findOne({
      where: { actorId: ids.dg, action: AuditAction.OFFICE_REPORT_EXPORTED },
      order: { createdAt: 'DESC' },
    });
    expect(audit?.after).toMatchObject({ wingId: wings.w2, page: 2, rows: 1 });
  }, 60_000);

  it('v1.16: a WING-scope additional charge with its own wing adds THAT wing (and only that)', async () => {
    const me = (
      await http().get(`${API}/auth/me`).set(as('dirExtra')).expect(200)
    ).body as {
      officeReportScope: string;
      officeReportWings: Array<{ id: string }>;
    };
    expect(me.officeReportScope).toBe('WING');
    expect(me.officeReportWings.map((w) => w.id)).toEqual([wings.w1, wings.w2]);

    // Default: the own wing first; the charge wing can be chosen.
    const own = await office('dirExtra').expect(200);
    expect(own.body).toMatchObject({
      wing: { id: wings.w1 },
      scopeWings: [{ id: wings.w1 }, { id: wings.w2 }],
      cards: { total: 1 },
    });
    const extra = await office('dirExtra', { wingId: wings.w2 }).expect(200);
    expect(extra.body).toMatchObject({
      wing: { id: wings.w2 },
      cards: { total: 2 },
    });
    await office('dirExtra', { officerId: ids.w2org }).expect(200);
    // Meeting B (wing 2 only) opens read-only for this viewer, not for the plain director.
    await http()
      .get(`${API}/meetings/${meetings.B}`)
      .set(as('dirExtra'))
      .expect(200);
    await http()
      .get(`${API}/meetings/${meetings.B}`)
      .set(as('director'))
      .expect(404);
    // A needs-review row gives nothing.
    const officer = (
      await http().get(`${API}/auth/me`).set(as('officer')).expect(200)
    ).body as { officeReportScope: string };
    expect(officer.officeReportScope).toBe('NONE');
  });
});
