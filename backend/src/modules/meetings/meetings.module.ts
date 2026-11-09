import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConflictEngineService } from './conflict-engine.service';
import { ConflictsController } from './conflicts.controller';
import { ConflictsService } from './conflicts.service';
import { MeetingConflict } from './entities/meeting-conflict.entity';
import { MeetingParticipant } from './entities/meeting-participant.entity';
import { Meeting } from './entities/meeting.entity';
import { MeetingNotifierService } from './meeting-notifier.service';
import { MeetingSchedulerService } from './meeting-scheduler.service';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Meeting, MeetingParticipant, MeetingConflict]),
  ],
  controllers: [MeetingsController, ConflictsController],
  providers: [
    MeetingsService,
    ConflictEngineService,
    MeetingNotifierService,
    ConflictsService,
    MeetingSchedulerService,
  ],
  exports: [MeetingsService],
})
export class MeetingsModule {}
