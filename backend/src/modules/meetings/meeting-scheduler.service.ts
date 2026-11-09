import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { EnvVars } from '../../config/env.validation';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { ConflictEngineService } from './conflict-engine.service';
import { MeetingStatus } from './enums/meeting-status.enum';

/** Grace period before an ended meeting is completed automatically. */
export const AUTO_COMPLETE_AFTER_MS = 60 * 60_000;

/**
 * Every 15 minutes: SCHEDULED meetings that ended more than 1 hour ago become COMPLETED and
 * their pending conflicts are resolved (step 8). Off when SCHEDULER_ENABLED=false (tests).
 */
@Injectable()
export class MeetingSchedulerService {
  private readonly logger = new Logger(MeetingSchedulerService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly engine: ConflictEngineService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<EnvVars, true>,
  ) {}

  @Cron('*/15 * * * *', { name: 'meeting-auto-complete' })
  async tick(): Promise<void> {
    if (!this.config.get('SCHEDULER_ENABLED', { infer: true })) return;
    try {
      const done = await this.autoComplete();
      if (done > 0) this.logger.log(`Auto-completed ${done} meeting(s)`);
    } catch (err) {
      this.logger.error(
        `Auto-complete failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async autoComplete(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - AUTO_COMPLETE_AFTER_MS);
    return this.dataSource.transaction(async (manager) => {
      const result = await manager.query<
        [Array<{ id: string }>, number] | Array<{ id: string }>
      >(
        `UPDATE meetings SET status = $1, "completedAt" = $2, "updatedAt" = now()
          WHERE status = $3 AND "endAt" < $4
        RETURNING id`,
        [MeetingStatus.COMPLETED, now, MeetingStatus.SCHEDULED, cutoff],
      );
      const rows = (Array.isArray(result[0]) ? result[0] : result) as Array<{
        id: string;
      }>;
      const ids = rows.map((r) => r.id);
      for (const id of ids) {
        await this.audit.log(
          {
            actorId: null,
            action: AuditAction.MEETING_COMPLETE,
            entityType: 'meeting',
            entityId: id,
            after: { status: MeetingStatus.COMPLETED, auto: true },
          },
          manager,
        );
      }
      await this.engine.resolveStale(manager, ids, null, null);
      return ids.length;
    });
  }
}
