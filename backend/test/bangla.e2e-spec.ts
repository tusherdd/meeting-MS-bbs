/**
 * SPEC.md §13.13 e2e: Bangla nukta letters. Incoming text (body and query) is normalised before
 * it is stored or searched, and the migration converts rows written before the rule.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { BANGLA_NUKTA } from '../src/common/utils/bangla';
import { hashPassword } from '../src/common/utils/password';
import { NormalizeBanglaNukta1794400000000 } from '../src/database/migrations/1794400000000-NormalizeBanglaNukta';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import { Wing } from '../src/modules/wings/entities/wing.entity';

const API = '/api/v1';
const PASSWORD = 'E2ePass1234';

// Forms (see common/utils/bangla.ts): built from code points, never typed literally.
const { YYA, YA_NUKTA, DDA_NUKTA, RRA, DDHA_NUKTA, RHA } = BANGLA_NUKTA;

describe('Bangla nukta letters (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let token = '';
  let designationId = '';
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    expect(ds.options.database).toMatch(/_test$/);

    designationId = (
      await ds.getRepository(Designation).insert({
        nameBn: 'নুক্তা পদবি',
        nameEn: 'E2EN Designation',
        priority: 7,
      })
    ).identifiers[0].id as string;
    await ds.getRepository(User).insert({
      loginEmail: 'officer@e2e-bangla.test',
      notificationEmail: 'officer@e2e-bangla.test',
      passwordHash: await hashPassword(PASSWORD),
      // Stored the right way: য + ়
      nameBn: `প্রল${YA_NUKTA} নুক্তা`,
      nameEn: 'E2EN Officer',
      designationId,
      role: UserRole.OFFICER,
      mustChangePassword: false,
    });
    const res = await http()
      .post(`${API}/auth/login`)
      .send({ loginEmail: 'officer@e2e-bangla.test', password: PASSWORD })
      .expect(200);
    token = (res.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('stores a meeting typed with the broken forms in the right forms', async () => {
    const day = DateTime.now().setZone('Asia/Dhaka').plus({ days: 30 });
    const at = (h: number) =>
      day.set({ hour: h, minute: 0, second: 0, millisecond: 0 }).toISO({
        suppressMilliseconds: true,
      });
    const res = await http()
      .post(`${API}/meetings`)
      .set(auth())
      .send({
        title: `সম${YYA} ব${DDA_NUKTA} আষা${DDHA_NUKTA}`,
        agenda: `বিষ${YYA}`,
        room: `ব${DDA_NUKTA} কক্ষ`,
        startAt: at(9),
        endAt: at(10),
        participantIds: [],
      })
      .expect(201);
    const body = res.body as { title: string; agenda: string; room: string };
    expect(body.title).toBe(`সম${YA_NUKTA} ব${RRA} আষা${RHA}`);
    expect(body.agenda).toBe(`বিষ${YA_NUKTA}`);
    expect(body.room).toBe(`ব${RRA} কক্ষ`);
  });

  it('finds a name whatever form the search text uses', async () => {
    for (const q of [`প্রল${YYA}`, `প্রল${YA_NUKTA}`]) {
      const res = await http()
        .get(`${API}/users/directory`)
        .query({ q })
        .set(auth())
        .expect(200);
      const names = (res.body as { items: { nameBn: string }[] }).items.map(
        (u) => u.nameBn,
      );
      expect(names).toContain(`প্রল${YA_NUKTA} নুক্তা`);
    }
  });

  it('never changes passwords: a password with U+09DF still logs in as typed', async () => {
    const withYya = `Pass1${YYA}word`;
    await ds
      .getRepository(User)
      .update(
        { loginEmail: 'officer@e2e-bangla.test' },
        { passwordHash: await hashPassword(withYya) },
      );
    await http()
      .post(`${API}/auth/login`)
      .send({ loginEmail: 'officer@e2e-bangla.test', password: withYya })
      .expect(200);
  });

  it('the migration converts old rows in place and is idempotent', async () => {
    const wingId = (
      await ds
        .getRepository(Wing)
        .insert({ nameBn: `পুরনো ব${DDA_NUKTA} উ${YYA}`, nameEn: 'E2EN Wing' })
    ).identifiers[0].id as string;
    await ds.query(
      `INSERT INTO "audit_logs" ("action", "entityType", "after") VALUES ('WING_CREATE', 'Wing', $1::jsonb)`,
      [JSON.stringify({ nameBn: `আষা${DDHA_NUKTA}` })],
    );

    const migration = new NormalizeBanglaNukta1794400000000();
    const runner = ds.createQueryRunner();
    try {
      await migration.up(runner);
      await migration.up(runner); // a second run changes nothing
    } finally {
      await runner.release();
    }

    const wing = await ds.getRepository(Wing).findOneByOrFail({ id: wingId });
    expect(wing.nameBn).toBe(`পুরনো ব${RRA} উ${YA_NUKTA}`);
    const [log] = await ds.query<{ after: { nameBn: string } }[]>(
      `SELECT "after" FROM "audit_logs" WHERE "after"->>'nameBn' LIKE 'আষা%'`,
    );
    expect(log.after.nameBn).toBe(`আষা${RHA}`);
  });
});
