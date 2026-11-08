import { validateEnv } from './env.validation';

const validEnv = (): Record<string, string> => ({
  NODE_ENV: 'development',
  PORT: '4000',
  APP_URL: 'http://localhost:4000',
  FRONTEND_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000, https://meeting.bbs.gov.bd',
  TZ: 'Asia/Dhaka',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'bbs_meeting',
  DB_PASSWORD: 'secret',
  DB_NAME: 'bbs_meeting',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: '',
  SMTP_PASSWORD: '',
  MAIL_FROM: 'BBS সভা সূচি <no-reply@bbs.gov.bd>',
  MAIL_DRY_RUN: 'true',
  UPLOAD_DIR: './uploads',
  MAX_UPLOAD_MB: '2',
  SWAGGER_ENABLED: 'true',
  SEED_SUPER_ADMIN_EMAIL: 'admin@bbs.gov.bd',
  SEED_SUPER_ADMIN_PASSWORD: '',
});

describe('validateEnv', () => {
  it('accepts a valid env and converts types', () => {
    const env = validateEnv(validEnv());
    expect(env.PORT).toBe(4000);
    expect(env.DB_PORT).toBe(5432);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.MAIL_DRY_RUN).toBe(true);
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.CORS_ORIGINS).toEqual([
      'http://localhost:3000',
      'https://meeting.bbs.gov.bd',
    ]);
  });

  it('ignores unrelated process variables', () => {
    expect(() =>
      validateEnv({ ...validEnv(), PATH: '/usr/bin', HOME: '/home/x' }),
    ).not.toThrow();
  });

  it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'])(
    'rejects %s shorter than 32 chars',
    (key) => {
      expect(() =>
        validateEnv({ ...validEnv(), [key]: 'x'.repeat(31) }),
      ).toThrow(/at least 32 characters/);
    },
  );

  it('rejects the placeholder secrets from .env.example', () => {
    expect(() =>
      validateEnv({
        ...validEnv(),
        JWT_ACCESS_SECRET: 'at_least_32_random_characters',
        JWT_REFRESH_SECRET: 'another_32_random_characters',
      }),
    ).toThrow(/JWT_ACCESS_SECRET[\s\S]*JWT_REFRESH_SECRET/);
  });

  it('rejects identical access and refresh secrets', () => {
    const same = 's'.repeat(40);
    expect(() =>
      validateEnv({
        ...validEnv(),
        JWT_ACCESS_SECRET: same,
        JWT_REFRESH_SECRET: same,
      }),
    ).toThrow(/must be different/);
  });

  it.each(['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'])(
    'rejects missing %s',
    (key) => {
      const env = validEnv();
      delete env[key];
      expect(() => validateEnv(env)).toThrow(new RegExp(key));
    },
  );

  it('rejects an empty DB_PASSWORD', () => {
    expect(() => validateEnv({ ...validEnv(), DB_PASSWORD: '' })).toThrow(
      /DB_PASSWORD/,
    );
  });

  it('reports every problem at once', () => {
    const env = validEnv();
    delete env.DB_HOST;
    delete env.DB_NAME;
    expect(() => validateEnv(env)).toThrow(/DB_HOST[\s\S]*DB_NAME/);
  });

  it.each([
    'http://localhost:3000/',
    'localhost:3000',
    'ftp://x.gov.bd',
    'http://x.gov.bd/app',
  ])('rejects CORS origin "%s"', (origin) => {
    expect(() => validateEnv({ ...validEnv(), CORS_ORIGINS: origin })).toThrow(
      /CORS_ORIGINS/,
    );
  });

  it('rejects a bad TTL format', () => {
    expect(() =>
      validateEnv({ ...validEnv(), JWT_ACCESS_TTL: '15 minutes' }),
    ).toThrow(/JWT_ACCESS_TTL/);
  });

  it('defaults SWAGGER_ENABLED to false', () => {
    const env = validEnv();
    delete env.SWAGGER_ENABLED;
    expect(validateEnv(env).SWAGGER_ENABLED).toBe(false);
  });
});
