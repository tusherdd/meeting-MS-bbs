import { EmailStatus } from './enums/email-status.enum';
import {
  afterFailure,
  LAST_ERROR_MAX_LENGTH,
  safeErrorText,
} from './mail-worker.logic';

describe('afterFailure (retry schedule)', () => {
  const now = new Date('2026-11-09T10:00:00Z');
  const minutesLater = (d: Date | null) =>
    (d!.getTime() - now.getTime()) / 60_000;

  it.each([
    [0, 1],
    [1, 5],
    [2, 15],
    [3, 60],
  ])('after failure #%d+1 → retry in %d min', (attemptsBefore, minutes) => {
    const outcome = afterFailure(attemptsBefore, now);
    expect(outcome.status).toBe(EmailStatus.PENDING);
    expect(outcome.attempts).toBe(attemptsBefore + 1);
    expect(minutesLater(outcome.nextAttemptAt)).toBe(minutes);
  });

  it('the 5th failure is final (FAILED, no next attempt)', () => {
    expect(afterFailure(4, now)).toEqual({
      status: EmailStatus.FAILED,
      attempts: 5,
      nextAttemptAt: null,
    });
  });
});

describe('safeErrorText', () => {
  const secrets = ['s3cretPass!', 'bbs.mailer@gmail.com'];

  it('keeps code and response code, removes credentials and their base64 forms', () => {
    const err = Object.assign(
      new Error(
        `Invalid login: 535-5.7.8 Username and Password not accepted for bbs.mailer@gmail.com ` +
          `(AUTH PLAIN ${Buffer.from('s3cretPass!').toString('base64')})`,
      ),
      { code: 'EAUTH', responseCode: 535 },
    );
    const text = safeErrorText(err, secrets);
    expect(text).toMatch(/^EAUTH 535 Invalid login/);
    expect(text).not.toContain('s3cretPass!');
    expect(text).not.toContain('bbs.mailer@gmail.com');
    expect(text).not.toContain(Buffer.from('s3cretPass!').toString('base64'));
    expect(text).toContain('***');
  });

  it('is short and single-line', () => {
    const text = safeErrorText(
      new Error(`line1\n${'x'.repeat(1000)}`),
      secrets,
    );
    expect(text.length).toBe(LAST_ERROR_MAX_LENGTH);
    expect(text).not.toContain('\n');
  });

  it('handles non-Error values and empty secrets', () => {
    expect(safeErrorText('boom', ['', ''])).toBe('boom');
  });
});
