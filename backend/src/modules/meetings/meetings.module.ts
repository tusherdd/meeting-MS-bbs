import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PdfModule } from '../reports/pdf/pdf.module';
import { User } from '../users/entities/user.entity';
import { ConflictEngineService } from './conflict-engine.service';
import { ConflictsController } from './conflicts.controller';
import { ConflictsService } from './conflicts.service';
import { MeetingConflict } from './entities/meeting-conflict.entity';
import { MeetingGuest } from './entities/meeting-guest.entity';
import { MeetingParticipant } from './entities/meeting-participant.entity';
import { Meeting } from './entities/meeting.entity';
import { MeetingNotifierService } from './meeting-notifier.service';
import { MeetingSchedulerService } from './meeting-scheduler.service';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { MeetingNoticeService } from './notice/meeting-notice.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Meeting,
      MeetingParticipant,
      MeetingConflict,
      MeetingGuest,
      User,
    ]),
    PdfModule,
  ],
  controllers: [MeetingsController, ConflictsController],
  providers: [
    MeetingsService,
    ConflictEngineService,
    MeetingNotifierService,
    ConflictsService,
    MeetingSchedulerService,
    MeetingNoticeService,
  ],
  exports: [MeetingsService],
})
export class MeetingsModule {}
