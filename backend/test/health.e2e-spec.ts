import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

/** Needs backend/.env and a reachable PostgreSQL. */
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health → 200 with DB up', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      database: { status: 'up' },
    });
  });

  it('sets helmet security headers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('unknown route → uniform error body', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .expect(404);
    expect(Object.keys(res.body as object).sort()).toEqual([
      'error',
      'message',
      'statusCode',
    ]);
  });

  it('routes outside the /api/v1 prefix are not served', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
