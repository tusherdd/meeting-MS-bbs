import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MAX_NOTICE_FILE_BYTES } from '../notices/notice-rules';
import { NoticeUploadErrorsInterceptor } from '../notices/notice-upload-errors.interceptor';
import { NOTICE_EXTRACTOR } from './extractors/notice-extractor';
import { OcrExtractor } from './extractors/ocr-extractor';
import { NoticeExtractController } from './notice-extract.controller';
import { NoticeExtractService } from './notice-extract.service';
import { OcrEngineService } from './ocr/ocr-engine.service';

/**
 * "Fill the meeting form from the notice" (v1.21, SPEC.md §6.12). The extractor is pluggable
 * (NOTICE_EXTRACTOR): the local OcrExtractor now, an AI extractor in part 2.
 */
@Module({
  imports: [
    // In memory only: the notice is never written to the disk (one file, max 10 MB).
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: MAX_NOTICE_FILE_BYTES, files: 1, fields: 5 },
    }),
  ],
  controllers: [NoticeExtractController],
  providers: [
    NoticeExtractService,
    NoticeUploadErrorsInterceptor,
    OcrEngineService,
    OcrExtractor,
    { provide: NOTICE_EXTRACTOR, useExisting: OcrExtractor },
  ],
})
export class NoticeExtractModule {}
