import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MAX_NOTICE_FILE_BYTES } from '../notices/notice-rules';
import { NoticeUploadErrorsInterceptor } from '../notices/notice-upload-errors.interceptor';
import { AiExtractor } from './extractors/ai-extractor';
import { NoticeReader } from './extractors/notice-reader';
import { OcrExtractor } from './extractors/ocr-extractor';
import { NoticeExtractController } from './notice-extract.controller';
import { NoticeExtractService } from './notice-extract.service';
import { OcrEngineService } from './ocr/ocr-engine.service';
import { SettingsModule } from '../settings/settings.module';

/**
 * "Fill the meeting form from the notice" (v1.21, SPEC.md §6.12). NoticeReader picks the
 * extractor from the admin setting (§6.13): the local OcrExtractor or the AiExtractor (with OCR
 * fallback).
 */
@Module({
  imports: [
    SettingsModule,
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
    AiExtractor,
    NoticeReader,
  ],
})
export class NoticeExtractModule {}
