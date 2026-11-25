import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import type { EnvVars } from '../../config/env.validation';
import type { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import type { AppSetting } from './entities/app-setting.entity';
import { SettingsService } from './settings.service';

/** v1.21 part 2: the app setting noticeExtractionMethod. */

function setup(key: string, stored: string | null = null) {
  let row: Partial<AppSetting> | null = stored
    ? { key: 'noticeExtractionMethod', value: stored }
    : null;
  const save = jest.fn((v: Partial<AppSetting>) => {
    row = v;
    return Promise.resolve(v);
  });
  const repo = {
    findOne: jest.fn(() => Promise.resolve(row)),
    create: jest.fn((v: Partial<AppSetting>) => ({ ...v })),
    save,
  } as unknown as Repository<AppSetting>;
  const config = {
    get: () => key,
  } as unknown as ConfigService<EnvVars, true>;
  const log = jest.fn().mockResolvedValue(undefined);
  const audit = { log } as unknown as AuditService;
  return { service: new SettingsService(repo, config, audit), log, save };
}

const ADMIN = { id: 'admin-1' } as AuthUser;

describe('SettingsService', () => {
  it('defaults to OCR when no row exists', async () => {
    const { service } = setup('');
    expect(await service.get()).toEqual({
      noticeExtractionMethod: 'OCR',
      aiAvailable: false,
    });
  });

  it('makes the AI option unavailable without a key (400, nothing saved)', async () => {
    const { service, save, log } = setup('   ');
    expect(service.aiAvailable()).toBe(false);
    await expect(
      service.update(ADMIN, { noticeExtractionMethod: 'AI' }, null),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('switches to AI with a key and audits the change', async () => {
    const { service, log } = setup('test-key-placeholder');
    const result = await service.update(
      ADMIN,
      { noticeExtractionMethod: 'AI' },
      '127.0.0.1',
    );
    expect(result).toEqual({ noticeExtractionMethod: 'AI', aiAvailable: true });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.SETTING_CHANGED,
        before: { key: 'noticeExtractionMethod', value: 'OCR' },
        after: { key: 'noticeExtractionMethod', value: 'AI' },
      }),
    );
    // The key is never part of the audit entry.
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      'test-key-placeholder',
    );
  });

  it('does not audit when nothing changes', async () => {
    const { service, log } = setup('k', 'OCR');
    await service.update(ADMIN, { noticeExtractionMethod: 'OCR' }, null);
    expect(log).not.toHaveBeenCalled();
  });

  it('ignores an unknown stored value', async () => {
    const { service } = setup('k', 'SOMETHING');
    expect(await service.noticeExtractionMethod()).toBe('OCR');
  });
});
