import type { Repository } from 'typeorm';
import type { User } from '../users/entities/user.entity';
import {
  UNKNOWN_EMAIL_TRACKING_MAX_ENTRIES,
  UNKNOWN_EMAIL_TRACKING_TTL_MS,
} from './auth.constants';
import { LoginAttemptService, loginDelayMs } from './login-attempt.service';

describe('loginDelayMs', () => {
  it.each([
    [0, 0],
    [4, 0],
    [5, 2_000],
    [6, 4_000],
    [7, 8_000],
    [8, 16_000],
    [9, 30_000],
    [50, 30_000],
    [1_000_000, 30_000],
  ])('%d previous failures → %d ms', (previous, expected) => {
    expect(loginDelayMs(previous)).toBe(expected);
  });
});

describe('LoginAttemptService', () => {
  const service = () =>
    new LoginAttemptService({} as unknown as Repository<User>);

  describe('waitBeforeAnswer', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('answers immediately for fewer than 5 previous failures', async () => {
      await expect(service().waitBeforeAnswer(4)).resolves.toBeUndefined();
    });

    it('waits the computed delay', async () => {
      let done = false;
      const promise = service()
        .waitBeforeAnswer(6)
        .then(() => (done = true));
      await jest.advanceTimersByTimeAsync(3_999);
      expect(done).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await promise;
      expect(done).toBe(true);
    });
  });

  describe('unknown email tracker', () => {
    it('counts failures per email, case- and space-insensitive', () => {
      const s = service();
      expect(s.unknownEmailFailures('ghost@example.test')).toBe(0);
      s.registerUnknownEmailFailure('ghost@example.test');
      s.registerUnknownEmailFailure(' GHOST@example.test ');
      expect(s.unknownEmailFailures('Ghost@Example.test')).toBe(2);
      expect(s.unknownEmailFailures('other@example.test')).toBe(0);
    });

    it('forgets an email after 24 h without failures', () => {
      const s = service();
      const t0 = 1_000_000;
      s.registerUnknownEmailFailure('ghost@example.test', t0);
      expect(
        s.unknownEmailFailures(
          'ghost@example.test',
          t0 + UNKNOWN_EMAIL_TRACKING_TTL_MS,
        ),
      ).toBe(1);
      expect(
        s.unknownEmailFailures(
          'ghost@example.test',
          t0 + UNKNOWN_EMAIL_TRACKING_TTL_MS + 1,
        ),
      ).toBe(0);
    });

    it('keeps at most the configured number of emails (oldest dropped first)', () => {
      const s = service();
      for (let i = 0; i <= UNKNOWN_EMAIL_TRACKING_MAX_ENTRIES; i++) {
        s.registerUnknownEmailFailure(`ghost${i}@example.test`, 1_000 + i);
      }
      expect(s.unknownEmailFailures('ghost0@example.test', 2_000)).toBe(0);
      expect(
        s.unknownEmailFailures(
          `ghost${UNKNOWN_EMAIL_TRACKING_MAX_ENTRIES}@example.test`,
          2_000,
        ),
      ).toBe(1);
    });
  });
});
