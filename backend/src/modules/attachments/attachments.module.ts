import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { DecisionStorageModule } from '../decisions/decision-storage.service';
import { Meeting } from '../meetings/entities/meeting.entity';
import { OfficeScopeModule } from '../office-scope/office-scope.module';
import { MAX_ATTACHMENT_FILE_BYTES } from './attachment-rules';
import { AttachmentUploadErrorsInterceptor } from './attachment-upload-errors.interceptor';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { MeetingAttachment } from './entities/meeting-attachment.entity';

/** "অন্যান্য সংযুক্তি" / other attachments of a meeting (v1.17, SPEC.md §6.11). */
@Module({
  imports: [
    TypeOrmModule.forFeature([Meeting, MeetingAttachment]),
    DecisionStorageModule,
    OfficeScopeModule,
    // In memory first: nothing unchecked touches the disk (one file, max 10 MB).
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_FILE_BYTES, files: 1, fields: 5 },
    }),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentUploadErrorsInterceptor],
})
export class AttachmentsModule {}
