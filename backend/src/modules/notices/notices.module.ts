import { OfficeScopeModule } from '../office-scope/office-scope.module';
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { DecisionStorageModule } from '../decisions/decision-storage.service';
import { Meeting } from '../meetings/entities/meeting.entity';
import { MeetingNoticeFile } from './entities/meeting-notice-file.entity';
import { MAX_NOTICE_FILE_BYTES } from './notice-rules';
import { NoticeUploadErrorsInterceptor } from './notice-upload-errors.interceptor';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';

/** The uploaded meeting notice "সভার নোটিশ" (v1.13, SPEC.md §6.8). */
@Module({
  imports: [
    TypeOrmModule.forFeature([Meeting, MeetingNoticeFile]),
    DecisionStorageModule,
    OfficeScopeModule,
    // In memory first: nothing unchecked touches the disk (one file, max 10 MB).
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: MAX_NOTICE_FILE_BYTES, files: 1, fields: 5 },
    }),
  ],
  controllers: [NoticesController],
  providers: [NoticesService, NoticeUploadErrorsInterceptor],
})
export class NoticesModule {}
