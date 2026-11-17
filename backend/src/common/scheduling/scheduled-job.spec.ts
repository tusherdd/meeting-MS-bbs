import { QueryFailedError } from 'typeorm';
import {
  isTransientDbError,
  ScheduledJob,
  shortErrorText,
} from './scheduled-job';

const withCode = (code: string, message = 'boom') =>
  Object.assign(new Error(message), { code });

describe('isTransientDbError', () => {
  it.each([
    [
      'pool connect timeout',
      new Error('Connection terminated due to connection timeout'),
    ],
    [
      'pool acquire timeout',
      new Error('timeout exceeded when trying to connect'),
    ],
    ['dropped connection', new Error('Connection terminated unexpectedly')],
    [
      'server refused',
      withCode('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:5432'),
    ],
    ['network reset', withCode('ECONNRESET')],
    ['socket timeout', withCode('ETIMEDOUT')],
    [
      'admin shutdown 57P01',
      withCode('57P01', 'terminating connection due to administrator command'),
    ],
    [
      'server starting 57P03',
      withCode('57P03', 'the database system is starting up'),
    ],
    [
      'too many connections 53300',
      withCode('53300', 'sorry, too many clients already'),
    ],
    ['connection exception class 08', withCode('08006')],
  ])('true for %s', (_, err) => {
    expect(isTransientDbError(err)).toBe(true);
  });

  it('looks inside TypeORM QueryFailedError.driverError and Error.cause', () => {
    const wrapped = new QueryFailedError(
      'SELECT 1',
      [],
      withCode('57P01', 'terminating connection'),
    );
    expect(isTransientDbError(wrapped)).toBe(true);
    expect(
      isTransientDbError(new Error('outer', { cause: withCode('ECONNRESET') })),
    ).toBe(true);
  });

  it.each([
    ['unique violation', withCode('23505', 'duplicate key value')],
    ['syntax error', withCode('42601', 'syntax error at or near')],
    [
      'plain bug',
      new TypeError("Cannot read properties of undefined (reading 'id')"),
    ],
    ['SMTP auth error', withCode('EAUTH', 'Invalid login')],
    ['not an error', 'oops'],
    ['null', null],
  ])('false for %s', (_, err) => {
    expect(isTransientDbError(err)).toBe(false);
  });

  it('does not loop forever on a self-referencing cause', () => {
    const err: Error & { cause?: unknown } = new Error('loop');
    err.cause = err;
    expect(isTransientDbError(err)).toBe(false);
  });
});

describe('shortErrorText', () => {
  it('is one line with the code, without a stack trace, at most 200 chars', () => {
    const err = withCode('ECONNRESET', `read\n  failed ${'x'.repeat(300)}`);
    const text = shortErrorText(err);
    expect(text.startsWith('ECONNRESET read failed')).toBe(true);
    expect(text).not.toContain('\n');
    expect(text).not.toContain('    at ');
    expect(text.length).toBeLessThanOrEqual(200);
  });
});

describe('ScheduledJob', () => {
  const logger = () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() });
  const dbDown = () =>
    Promise.reject(
      new Error('Connection terminated due to connection timeout'),
    );

  it('runs the work and resolves true', async () => {
    const log = logger();
    const job = new ScheduledJob('Mail batch', log);
    const work = jest.fn(() => Promise.resolve());
    await expect(job.run(work)).resolves.toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('a DB outage: one short WARN, never throws, quiet while it lasts, one line on recovery', async () => {
    const log = logger();
    const job = new ScheduledJob('Mail batch', log);

    await expect(job.run(dbDown)).resolves.toBe(false);
    await expect(job.run(dbDown)).resolves.toBe(false);
    await expect(job.run(dbDown)).resolves.toBe(false);

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      'Mail batch: database not reachable (Connection terminated due to connection timeout); retrying on the next run',
    );
    expect(log.error).not.toHaveBeenCalled();
    expect(job.waitingForDatabase).toBe(true);

    // Retried on the next tick: now the DB is back.
    await expect(job.run(() => Promise.resolve())).resolves.toBe(true);
    expect(log.log).toHaveBeenCalledWith(
      'Mail batch: database reachable again',
    );
    expect(job.waitingForDatabase).toBe(false);

    // A later, new outage is reported again (once).
    await job.run(dbDown);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it('other errors: one ERROR line per failure, no stack, never throws', async () => {
    const log = logger();
    const job = new ScheduledJob('Meeting auto-complete', log);
    const bug = () => Promise.reject(new TypeError('x is not a function'));
    await expect(job.run(bug)).resolves.toBe(false);
    await expect(job.run(bug)).resolves.toBe(false);
    expect(log.error).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith(
      'Meeting auto-complete failed: x is not a function',
    );
    // Only the message is passed: no stack trace argument.
    expect(log.error.mock.calls[0]).toHaveLength(1);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('uses describeError for the text (e.g. to remove SMTP credentials)', async () => {
    const log = logger();
    const job = new ScheduledJob('Mail batch', log, {
      describeError: () => 'cleaned text',
    });
    await job.run(() => Promise.reject(new Error('Invalid login: secret')));
    expect(log.error).toHaveBeenCalledWith('Mail batch failed: cleaned text');
  });

  it('skips a tick while the previous run of the same job is still busy', async () => {
    const log = logger();
    const job = new ScheduledJob('Mail batch', log);
    let release!: () => void;
    const slow = jest.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const first = job.run(slow);
    await expect(job.run(slow)).resolves.toBe(false);
    expect(slow).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toBe(true);
    // Free again afterwards.
    await expect(job.run(() => Promise.resolve())).resolves.toBe(true);
  });

  it('a failing job does not affect another job', async () => {
    const log = logger();
    const failing = new ScheduledJob('Mail batch', log);
    const other = new ScheduledJob('Meeting auto-complete', log);
    const work = jest.fn(() => Promise.resolve());
    await Promise.all([failing.run(dbDown), other.run(work)]);
    expect(work).toHaveBeenCalledTimes(1);
  });
});
