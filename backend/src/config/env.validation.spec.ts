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
  DEFAULT_OFFICER_PASSWORD: 'Officer2026pass',
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

  describe('DEFAULT_OFFICER_PASSWORD (owner decision 2026-11-09)', () => {
    it('is required', () => {
      const env = validEnv();
      delete env.DEFAULT_OFFICER_PASSWORD;
      expect(() => validateEnv(env)).toThrow(
        /DEFAULT_OFFICER_PASSWORD" is required/,
      );
      expect(() =>
        validateEnv({ ...validEnv(), DEFAULT_OFFICER_PASSWORD: '' }),
      ).toThrow(/DEFAULT_OFFICER_PASSWORD" is required/);
    });

    it.each(['short1', 'onlyletters', '1234567890'])(
      'must satisfy the password rule, and the error never shows the value (%s)',
      (weak) => {
        let message = '';
        try {
          validateEnv({ ...validEnv(), DEFAULT_OFFICER_PASSWORD: weak });
        } catch (err) {
          message = (err as Error).message;
        }
        expect(message).toMatch(
          /DEFAULT_OFFICER_PASSWORD" does not meet the password rule/,
        );
        expect(message).not.toContain(weak);
      },
    );

    it('is allowed in production', () => {
      expect(() =>
        validateEnv({
          ...validEnv(),
          NODE_ENV: 'production',
          APP_URL: 'https://api.meeting.bbs.gov.bd',
          FRONTEND_URL: 'https://meeting.bbs.gov.bd',
          CORS_ORIGINS: 'https://meeting.bbs.gov.bd',
          SWAGGER_ENABLED: 'false',
          DEFAULT_OFFICER_PASSWORD: 'Officer2026pass',
        }),
      ).not.toThrow();
    });
  });

  it('THROTTLE_USER_LIMIT defaults to 300 and must stay between 10 and 10000', () => {
    expect(validateEnv(validEnv()).THROTTLE_USER_LIMIT).toBe(300);
    expect(
      validateEnv({ ...validEnv(), THROTTLE_USER_LIMIT: '600' }).THROTTLE_USER_LIMIT,
    ).toBe(600);
    expect(() =>
      validateEnv({ ...validEnv(), THROTTLE_USER_LIMIT: '5' }),
    ).toThrow(/THROTTLE_USER_LIMIT/);
  });

  it('THROTTLE_LIMIT defaults to 100 and must stay between 10 and 10000', () => {
    expect(validateEnv(validEnv()).THROTTLE_LIMIT).toBe(100);
    expect(
      validateEnv({ ...validEnv(), THROTTLE_LIMIT: '1000' }).THROTTLE_LIMIT,
    ).toBe(1000);
    expect(() => validateEnv({ ...validEnv(), THROTTLE_LIMIT: '5' })).toThrow(
      /THROTTLE_LIMIT/,
    );
  });

  it('defaults SWAGGER_ENABLED to false', () => {
    const env = validEnv();
    delete env.SWAGGER_ENABLED;
    expect(validateEnv(env).SWAGGER_ENABLED).toBe(false);
  });

  describe('production safety checks', () => {
    const prod = (): Record<string, string> => ({
      ...validEnv(),
      NODE_ENV: 'production',
      APP_URL: 'https://api.meeting.bbs.gov.bd',
      FRONTEND_URL: 'https://meeting.bbs.gov.bd',
      CORS_ORIGINS: 'https://meeting.bbs.gov.bd',
      SWAGGER_ENABLED: 'false',
      MAIL_DRY_RUN: 'false',
    });

    it('accepts a safe production config', () => {
      expect(() => validateEnv(prod())).not.toThrow();
    });

    it.each([
      [
        'Swagger without basic auth',
        { SWAGGER_ENABLED: 'true' },
        /SWAGGER_ENABLED=true needs SWAGGER_USER/,
      ],
      [
        'MAIL_DRY_RUN not set',
        { MAIL_DRY_RUN: '' },
        /MAIL_DRY_RUN must be set explicitly/,
      ],
      [
        'localhost in CORS',
        { CORS_ORIGINS: 'https://meeting.bbs.gov.bd,http://localhost:3000' },
        /must not contain localhost/,
      ],
      [
        'http APP_URL',
        { APP_URL: 'http://api.meeting.bbs.gov.bd' },
        /APP_URL must use https/,
      ],
    ])('refuses: %s', (_label, change, pattern) => {
      const env: Record<string, string> = { ...prod(), ...change };
      if (env.MAIL_DRY_RUN === '') delete env.MAIL_DRY_RUN;
      expect(() => validateEnv(env)).toThrow(pattern);
    });

    it('allows Swagger in production with basic auth', () => {
      expect(() =>
        validateEnv({
          ...prod(),
          SWAGGER_ENABLED: 'true',
          SWAGGER_USER: 'docs',
          SWAGGER_PASSWORD: 'long-enough-pass',
        }),
      ).not.toThrow();
    });

    it('development is not affected', () => {
      expect(() =>
        validateEnv({ ...validEnv(), CORS_ORIGINS: 'http://localhost:3000' }),
      ).not.toThrow();
    });
  });

  it.each([
    ['false', false],
    ['true', true],
    ['1', 1],
    ['loopback', 'loopback'],
  ])('TRUST_PROXY=%s', (raw, parsed) => {
    expect(validateEnv({ ...validEnv(), TRUST_PROXY: raw }).TRUST_PROXY).toBe(
      parsed,
    );
  });
});
