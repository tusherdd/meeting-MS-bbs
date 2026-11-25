import { NotFoundException } from '@nestjs/common';
import { ConditionalModule, ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  ThrottlerModule,
  ThrottlerStorage,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import { productionProblems, type EnvVars } from '../../config/env.validation';
import { TestHooksController } from './test-hooks.controller';
import { testHooksEnabled } from './test-hooks.guard';
import { TestHooksModule } from './test-hooks.module';

describe('test-only throttle reset (v1.6)', () => {
  it('is enabled only for NODE_ENV=test or E2E_TEST_HOOKS=true outside production', () => {
    expect(testHooksEnabled({ NODE_ENV: 'test' })).toBe(true);
    expect(
      testHooksEnabled({ NODE_ENV: 'development', E2E_TEST_HOOKS: 'true' }),
    ).toBe(true);
    expect(testHooksEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(testHooksEnabled({ E2E_TEST_HOOKS: 'false' })).toBe(false);
    expect(
      testHooksEnabled({ NODE_ENV: 'production', E2E_TEST_HOOKS: 'true' }),
    ).toBe(false);
    expect(
      testHooksEnabled({ NODE_ENV: 'production', E2E_TEST_HOOKS: true }),
    ).toBe(false);
  });

  it('env validation refuses E2E_TEST_HOOKS=true in production', () => {
    const env = {
      NODE_ENV: 'production',
      E2E_TEST_HOOKS: true,
      SWAGGER_ENABLED: false,
      CORS_ORIGINS: ['https://meeting.example.org'],
      APP_URL: 'https://api.example.org',
      FRONTEND_URL: 'https://meeting.example.org',
    } as unknown as EnvVars;
    expect(productionProblems(env, { MAIL_DRY_RUN: 'false' })).toEqual([
      'E2E_TEST_HOOKS must not be true in production',
    ]);
    expect(
      productionProblems(
        { ...env, E2E_TEST_HOOKS: false },
        { MAIL_DRY_RUN: 'false' },
      ),
    ).toEqual([]);
  });

  describe('module registration', () => {
    const saved = { ...process.env };
    afterEach(() => {
      process.env = { ...saved };
    });

    async function compile(nodeEnv: string, flag: string) {
      process.env.NODE_ENV = nodeEnv;
      process.env.E2E_TEST_HOOKS = flag;
      return Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
          ThrottlerModule.forRoot([{ ttl: 1000, limit: 1 }]),
          ConditionalModule.registerWhen(TestHooksModule, (env) =>
            testHooksEnabled(env),
          ),
        ],
      }).compile();
    }

    it('the route does not exist in production, even with the flag', async () => {
      const moduleRef = await compile('production', 'true');
      expect(() =>
        moduleRef.get(TestHooksController, { strict: false }),
      ).toThrow();
      await moduleRef.close();
    });

    it('the route exists with the flag in development and clears the counters', async () => {
      const moduleRef = await compile('development', 'true');
      const controller = moduleRef.get(TestHooksController, { strict: false });
      const storage = moduleRef.get<ThrottlerStorageService>(ThrottlerStorage, {
        strict: false,
      });
      for (let i = 0; i < 3; i++)
        await storage.increment('k', 60_000, 3, 0, 'default');
      expect(
        (await storage.increment('k', 60_000, 3, 0, 'default')).isBlocked,
      ).toBe(true);
      controller.resetThrottle();
      expect(storage.storage.size).toBe(0);
      // The next request starts from zero again (not rebuilt from the old hits).
      const next = await storage.increment('k', 60_000, 3, 0, 'default');
      expect(next.isBlocked).toBe(false);
      expect(next.totalHits).toBe(1);
      await moduleRef.close();
    });
  });

  it('the controller itself refuses to run in production', () => {
    const config = {
      get: (key: string) => (key === 'NODE_ENV' ? 'production' : true),
    } as unknown as ConfigService<EnvVars, true>;
    const controller = new TestHooksController(
      new ThrottlerStorageService(),
      config,
    );
    expect(() => controller.resetThrottle()).toThrow(NotFoundException);
  });
});
