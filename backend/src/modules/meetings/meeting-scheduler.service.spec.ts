import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import type { EnvVars } from '../../config/env.validation';
import type { AuditService } from '../audit/audit.service';
import type { ConflictEngineService } from './conflict-engine.service';
import { MeetingSchedulerService } from './meeting-scheduler.service';

function setup(schedulerEnabled = true) {
  const transaction = jest.fn();
  const service = new MeetingSchedulerService(
    { transaction } as unknown as DataSource,
    {} as ConflictEngineService,
    {} as AuditService,
    {
      get: (k: keyof EnvVars) =>
        k === 'SCHEDULER_ENABLED' ? schedulerEnabled : undefined,
    } as unknown as ConfigService<EnvVars, true>,
  );
  return { service, transaction };
}

describe('MeetingSchedulerService.tick (resilient to DB outages)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does nothing when SCHEDULER_ENABLED=false', async () => {
    const { service, transaction } = setup(false);
    await service.tick();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('a DB connection timeout is one short WARN, never throws, and is retried on the next tick', async () => {
    const { service, transaction } = setup();
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    transaction.mockRejectedValue(
      new Error('timeout exceeded when trying to connect'),
    );

    await expect(service.tick()).resolves.toBeUndefined();
    await expect(service.tick()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toBe(
      'Meeting auto-complete: database not reachable (timeout exceeded when trying to connect); retrying on the next run',
    );
    expect(error).not.toHaveBeenCalled();

    transaction.mockResolvedValue(2);
    await service.tick();
    expect(transaction).toHaveBeenCalledTimes(3);
    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(lines).toContain('Meeting auto-complete: database reachable again');
    expect(lines).toContain('Auto-completed 2 meeting(s)');
  });

  it('other errors are one ERROR line (no stack) and never throw', async () => {
    const { service, transaction } = setup();
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    transaction.mockRejectedValue(new TypeError('x is not a function'));
    await expect(service.tick()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      'Meeting auto-complete failed: x is not a function',
    );
  });
});
