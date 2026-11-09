import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import {
  getDayRange,
  getWeekRange,
  type DateRange,
} from '../../common/utils/time';
import { ChangeRequest } from '../change-requests/entities/change-request.entity';
import { ChangeRequestStatus } from '../change-requests/enums/change-request-status.enum';
import { EmailOutbox } from '../mail/entities/email-outbox.entity';
import { EmailStatus } from '../mail/enums/email-status.enum';
import { MeetingConflict } from '../meetings/entities/meeting-conflict.entity';
import { Meeting } from '../meetings/entities/meeting.entity';
import { ConflictStatus } from '../meetings/enums/conflict-status.enum';
import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import type { AdminStatsDto } from './dto/admin-stats.dto';

/** Dashboard counters for admins (SPEC.md §8 "Admin"). */
@Injectable()
export class AdminStatsService {
  constructor(private readonly dataSource: DataSource) {}

  async stats(now = new Date()): Promise<AdminStatsDto> {
    const users = this.dataSource.getRepository(User);
    const meetingsStarting = (range: DateRange) =>
      this.dataSource
        .getRepository(Meeting)
        .createQueryBuilder('m')
        .where('m.status <> :cancelled', { cancelled: MeetingStatus.CANCELLED })
        .andWhere('m.startAt >= :start AND m.startAt < :end', range)
        .getCount();

    const [
      total,
      active,
      admins,
      today,
      thisWeek,
      pendingConflicts,
      pendingChangeRequests,
      failedMails,
    ] = await Promise.all([
      users.count(),
      users.countBy({ isActive: true }),
      users.countBy({ role: In([UserRole.ADMIN, UserRole.SUPER_ADMIN]) }),
      meetingsStarting(getDayRange(now)),
      meetingsStarting(getWeekRange(now)),
      this.dataSource
        .getRepository(MeetingConflict)
        .countBy({ status: ConflictStatus.PENDING }),
      this.dataSource
        .getRepository(ChangeRequest)
        .countBy({ status: ChangeRequestStatus.PENDING }),
      this.dataSource
        .getRepository(EmailOutbox)
        .countBy({ status: EmailStatus.FAILED }),
    ]);

    return {
      users: { total, active, inactive: total - active, admins },
      meetings: { today, thisWeek },
      pendingConflicts,
      pendingChangeRequests,
      failedMails,
      generatedAt: now,
    };
  }
}
