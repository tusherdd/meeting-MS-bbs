import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { Meeting } from '../meetings/entities/meeting.entity';
import { MeetingsModule } from '../meetings/meetings.module';
import { MAX_DECISION_FILE_BYTES, MAX_DECISION_FILES } from './decision-rules';
import { DecisionStorageModule } from './decision-storage.service';
import { DecisionUploadErrorsInterceptor } from './decision-upload-errors.interceptor';
import { DecisionsController } from './decisions.controller';
import { DecisionsService } from './decisions.service';
import { MeetingDecisionFile } from './entities/meeting-decision-file.entity';

/** Meeting minutes "সভা কার্যবিবরণী" (v1.11, SPEC.md §6.9). */
@Module({
  imports: [
    TypeOrmModule.forFeature([Meeting, MeetingDecisionFile]),
    MeetingsModule,
    DecisionStorageModule,
    // In memory first: nothing unchecked touches the disk (max 10 files × 10 MB per request).
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_DECISION_FILE_BYTES,
        files: MAX_DECISION_FILES,
        fields: 5,
      },
    }),
  ],
  controllers: [DecisionsController],
  providers: [DecisionsService, DecisionUploadErrorsInterceptor],
})
export class DecisionsModule {}
