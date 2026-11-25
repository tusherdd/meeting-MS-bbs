import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import type { EnvVars } from '../../config/env.validation';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import type {
  AppSettingsDto,
  UpdateAppSettingsDto,
} from './dto/app-settings.dto';
import { AppSetting } from './entities/app-setting.entity';
import { SETTINGS_MESSAGES } from './settings.messages';
import {
  isNoticeExtractionMethod,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  type NoticeExtractionMethod,
} from './settings.types';

/**
 * App-wide settings (v1.21 part 2, SPEC.md §6.13). Read on every use (one indexed row; no cache,
 * so a change applies at once). Changes are audited (SETTING_CHANGED: key, old and new value).
 */
@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settings: Repository<AppSetting>,
    private readonly config: ConfigService<EnvVars, true>,
    private readonly audit: AuditService,
  ) {}

  /** true when ANTHROPIC_API_KEY is set (never returns or logs the key). */
  aiAvailable(): boolean {
    const key = this.config.get('ANTHROPIC_API_KEY', { infer: true });
    return typeof key === 'string' && key.trim().length > 0;
  }

  async noticeExtractionMethod(): Promise<NoticeExtractionMethod> {
    const row = await this.settings.findOne({
      where: { key: SETTING_KEYS.noticeExtractionMethod },
    });
    return row && isNoticeExtractionMethod(row.value)
      ? row.value
      : SETTING_DEFAULTS.noticeExtractionMethod;
  }

  async get(): Promise<AppSettingsDto> {
    return {
      noticeExtractionMethod: await this.noticeExtractionMethod(),
      aiAvailable: this.aiAvailable(),
    };
  }

  async update(
    actor: AuthUser,
    dto: UpdateAppSettingsDto,
    ip: string | null,
  ): Promise<AppSettingsDto> {
    const next = dto.noticeExtractionMethod;
    if (next === 'AI' && !this.aiAvailable())
      throw new BadRequestException(SETTINGS_MESSAGES.aiUnavailable);

    const before = await this.noticeExtractionMethod();
    if (before !== next) {
      const key = SETTING_KEYS.noticeExtractionMethod;
      const row =
        (await this.settings.findOne({ where: { key } })) ??
        this.settings.create({ key });
      row.value = next;
      row.updatedById = actor.id;
      await this.settings.save(row);
      await this.audit.log({
        actorId: actor.id,
        action: AuditAction.SETTING_CHANGED,
        entityType: 'setting',
        entityId: null,
        before: { key, value: before },
        after: { key, value: next },
        ip,
      });
    }
    return this.get();
  }
}
