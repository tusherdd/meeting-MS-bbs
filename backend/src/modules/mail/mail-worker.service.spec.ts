import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager } from 'typeorm';
import type { EnvVars } from '../../config/env.validation';
import { EmailOutbox } from './entities/email-outbox.entity';
import { EmailStatus } from './enums/email-status.enum';
import type { MailTransport } from './mail-transport';
import { MailWorkerService } from './mail-worker.service';

const NOW = new Date('2026-11-09T10:00:00Z');

function outboxRow(overrides: Partial<EmailOutbox> = {}): EmailOutbox {
  return Object.assign(new EmailOutbox(), {
    id: 'm1',
    to: 'rahim.uddin@gmail.com',
    subject: 'Password Reset',
    html: '<p>link with token</p>',
    text: 'link with token',
    status: EmailStatus.PENDING,
    attempts: 0,
    nextAttemptAt: NOW,
    ...overrides,
  });
}

function setup(options: { dryRun: boolean; rows?: EmailOutbox[] }) {
  const query = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    setOnLocked: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(options.rows ?? [outboxRow()]),
  };
  const repo = {
    createQueryBuilder: jest.fn(() => query),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue({ affected: 3 }),
  };
  const manager = { getRepository: jest.fn(() => repo) };
  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
      Promise.resolve().then(() => cb(manager as unknown as EntityManager)),
    ),
    getRepository: jest.fn(() => repo),
  };
  const send = jest.fn<Promise<void>, Parameters<MailTransport['send']>>();
  const transport: MailTransport = { send };
  const env: Partial<EnvVars> = {
    NODE_ENV: 'test', // no preview files in unit tests
    MAIL_DRY_RUN: options.dryRun,
    SMTP_USER: 'bbs.mailer@gmail.com',
    SMTP_PASSWORD: 's3cretPass!',
    SCHEDULER_ENABLED: true,
  };
  const worker = new MailWorkerService(
    dataSource as unknown as DataSource,
    transport,
    { get: (k: keyof EnvVars) => env[k] } as unknown as ConfigService<
      EnvVars,
      true
    >,
  );
  const updateOf = (i = 0) =>
    repo.update.mock.calls[i] as [string, Partial<EmailOutbox>];
  return { worker, query, repo, send, updateOf };
}

describe('MailWorkerService.processBatch', () => {
  it('claims at most 20 due PENDING rows with FOR UPDATE SKIP LOCKED', async () => {
    const { worker, query } = setup({ dryRun: true });
    await worker.processBatch(NOW);
    expect(query.where).toHaveBeenCalledWith('o.status = :status', {
      status: EmailStatus.PENDING,
    });
    expect(query.andWhere).toHaveBeenCalledWith('o.nextAttemptAt <= :now', {
      now: NOW,
    });
    expect(query.limit).toHaveBeenCalledWith(20);
    expect(query.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(query.setOnLocked).toHaveBeenCalledWith('skip_locked');
  });

  it('dry-run: never touches SMTP, logs only masked recipient + subject, marks SENT and purges the body', async () => {
    const { worker, send, updateOf } = setup({ dryRun: true });
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    const result = await worker.processBatch(NOW);

    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(updateOf()).toEqual([
      'm1',
      {
        status: EmailStatus.SENT,
        sentAt: NOW,
        attempts: 1,
        lastError: null,
        html: null,
        text: null,
      },
    ]);
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('ra***@gmail.com');
    expect(logged).toContain('Password Reset');
    expect(logged).not.toContain('rahim.uddin@gmail.com');
    expect(logged).not.toContain('token');
    log.mockRestore();
  });

  it('real send: passes html + text to the transport, then purges them', async () => {
    const { worker, send, updateOf } = setup({ dryRun: false });
    await worker.processBatch(NOW);
    expect(send).toHaveBeenCalledWith({
      to: 'rahim.uddin@gmail.com',
      subject: 'Password Reset',
      html: '<p>link with token</p>',
      text: 'link with token',
    });
    expect(updateOf()[1]).toMatchObject({
      status: EmailStatus.SENT,
      html: null,
      text: null,
    });
  });

  it('failure: attempts + 1, retry later, short error without credentials; body kept for the retry', async () => {
    const { worker, send, updateOf } = setup({ dryRun: false });
    send.mockRejectedValue(
      Object.assign(
        new Error('Invalid login for bbs.mailer@gmail.com with s3cretPass!'),
        {
          code: 'EAUTH',
        },
      ),
    );

    const result = await worker.processBatch(NOW);

    expect(result).toEqual({ sent: 0, retried: 1, failed: 0 });
    const [, update] = updateOf();
    expect(update).toMatchObject({ status: EmailStatus.PENDING, attempts: 1 });
    expect(update.nextAttemptAt!.getTime() - NOW.getTime()).toBe(60_000);
    expect(update.lastError).toMatch(/^EAUTH Invalid login/);
    expect(update.lastError).not.toMatch(/s3cretPass!|bbs\.mailer@gmail\.com/);
    expect(update).not.toHaveProperty('html');
  });

  it('the 5th failure marks the mail FAILED', async () => {
    const { worker, send, updateOf } = setup({
      dryRun: false,
      rows: [outboxRow({ attempts: 4 })],
    });
    send.mockRejectedValue(new Error('ETIMEDOUT'));
    const result = await worker.processBatch(NOW);
    expect(result).toEqual({ sent: 0, retried: 0, failed: 1 });
    expect(updateOf()[1]).toMatchObject({
      status: EmailStatus.FAILED,
      attempts: 5,
    });
    expect(updateOf()[1]).not.toHaveProperty('nextAttemptAt');
  });

  it('one bad mail does not stop the rest of the batch', async () => {
    const { worker, send } = setup({
      dryRun: false,
      rows: [outboxRow({ id: 'bad' }), outboxRow({ id: 'good' })],
    });
    send.mockRejectedValueOnce(new Error('550 mailbox unavailable'));
    const result = await worker.processBatch(NOW);
    expect(result).toEqual({ sent: 1, retried: 1, failed: 0 });
  });

  it('a second run in the same process while one is busy does nothing', async () => {
    const { worker, send } = setup({ dryRun: false });
    let release!: () => void;
    send.mockReturnValue(new Promise<void>((r) => (release = r)));
    const first = worker.processBatch(NOW);
    await new Promise((r) => setImmediate(r));
    await expect(worker.processBatch(NOW)).resolves.toEqual({
      sent: 0,
      retried: 0,
      failed: 0,
    });
    release();
    await expect(first).resolves.toEqual({ sent: 1, retried: 0, failed: 0 });
  });
});

describe('MailWorkerService.cleanup', () => {
  it('deletes SENT rows older than 30 days', async () => {
    const { worker, repo } = setup({ dryRun: true });
    await expect(worker.cleanup(NOW)).resolves.toBe(3);
    const [where] = repo.delete.mock.calls[0] as [
      { status: EmailStatus; sentAt: { value: Date } },
    ];
    expect(where.status).toBe(EmailStatus.SENT);
    expect(NOW.getTime() - where.sentAt.value.getTime()).toBe(30 * 86_400_000);
  });
});

describe('MailWorkerService scheduled ticks (resilient to DB outages)', () => {
  afterEach(() => jest.restoreAllMocks());

  const spyLogger = () => ({
    warn: jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined),
    error: jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined),
    log: jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined),
  });

  it('a DB connection timeout is one short WARN, never throws, and the next tick retries', async () => {
    const { worker, query } = setup({ dryRun: true });
    const logs = spyLogger();
    query.getMany.mockRejectedValue(
      new Error('Connection terminated due to connection timeout'),
    );

    await expect(worker.sendDueMail()).resolves.toBeUndefined();
    await expect(worker.sendDueMail()).resolves.toBeUndefined();

    expect(logs.warn).toHaveBeenCalledTimes(1);
    expect(String(logs.warn.mock.calls[0][0])).toBe(
      'Mail batch: database not reachable (Connection terminated due to connection timeout); retrying on the next run',
    );
    expect(logs.error).not.toHaveBeenCalled();

    // DB back: the next tick sends the mail and says so once.
    query.getMany.mockResolvedValue([outboxRow()]);
    await worker.sendDueMail();
    const lines = logs.log.mock.calls.map((c) => String(c[0]));
    expect(lines).toContain('Mail batch: database reachable again');
    expect(lines).toContain('Mail batch: 1 sent, 0 will retry, 0 failed');
  });

  it('other errors are one ERROR line without SMTP credentials', async () => {
    const { worker, query } = setup({ dryRun: true });
    const logs = spyLogger();
    query.getMany.mockRejectedValue(
      new Error('bad state for bbs.mailer@gmail.com / s3cretPass!'),
    );
    await expect(worker.sendDueMail()).resolves.toBeUndefined();
    expect(logs.error).toHaveBeenCalledTimes(1);
    const line = String(logs.error.mock.calls[0][0]);
    expect(line.startsWith('Mail batch failed: ')).toBe(true);
    expect(line).not.toContain('s3cretPass!');
    expect(line).not.toContain('bbs.mailer@gmail.com');
  });

  it('daily cleanup: a DB outage is a WARN, never a crash', async () => {
    const { worker, repo } = setup({ dryRun: true });
    const logs = spyLogger();
    repo.delete.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
        code: 'ECONNREFUSED',
      }),
    );
    await expect(worker.dailyCleanup()).resolves.toBeUndefined();
    expect(logs.warn).toHaveBeenCalledTimes(1);
    expect(String(logs.warn.mock.calls[0][0])).toContain(
      'Mail outbox cleanup: database not reachable',
    );
    expect(logs.error).not.toHaveBeenCalled();
  });
});
