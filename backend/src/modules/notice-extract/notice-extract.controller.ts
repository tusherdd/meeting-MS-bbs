import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { hours, Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AppRequest, AuthUser } from '../../common/types/auth-user';
import { NoticeUploadErrorsInterceptor } from '../notices/notice-upload-errors.interceptor';
import {
  NoticeExtractResponseDto,
  NoticeExtractUploadDto,
} from './dto/notice-extract.dto';
import {
  NoticeExtractService,
  type IncomingExtractFile,
} from './notice-extract.service';

/** At most 20 extractions per user per day (OCR is heavy). */
const EXTRACT_THROTTLE = { default: { limit: 20, ttl: hours(24) } };

/** "Fill the meeting form from the notice" (v1.21, SPEC.md §6.12). */
@ApiTags('Meeting notice')
@ApiBearerAuth()
@Controller('meetings')
export class NoticeExtractController {
  constructor(private readonly service: NoticeExtractService) {}

  @Throttle(EXTRACT_THROTTLE)
  @Post('notice-extract')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(NoticeUploadErrorsInterceptor, FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: NoticeExtractUploadDto })
  @ApiOperation({
    summary:
      'Read a meeting notice and return the form fields (nothing is stored)',
    description:
      'For the create and edit forms. Same file rules as the notice upload (PDF, DOCX without macros, ' +
      'JPEG, PNG; checked by the bytes; max 10 MB). The file is processed in memory and dropped; no ' +
      'meeting is created. PDF: the text layer, or OCR of page 1 (and 2) when it holds no real Bangla text ' +
      '(scans, Bijoy fonts); images: OCR (local tesseract.js, ben+eng). Officers are matched on the server ' +
      '(active officers only, never SUPER_ADMIN). Fields not found are null. Every officer and admin, not ' +
      'SUPER_ADMIN. 20 per user per day. Audited (NOTICE_EXTRACTED: method, success, duration).',
  })
  @ApiOkResponse({ type: NoticeExtractResponseDto })
  @ApiBadRequestResponse({
    description: 'No file, wrong type, macro-enabled Word file, unreadable',
  })
  @ApiForbiddenResponse({ description: 'SUPER_ADMIN (system account)' })
  @ApiPayloadTooLargeResponse({ description: 'File larger than 10 MB' })
  @ApiUnprocessableEntityResponse({
    description: 'The file could not be read (e.g. a broken PDF)',
  })
  @ApiTooManyRequestsResponse({ description: 'More than 20 extractions today' })
  extract(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: IncomingExtractFile | undefined,
    @Req() req: AppRequest,
  ): Promise<NoticeExtractResponseDto> {
    return this.service.extract(user, file, req.ip ?? null);
  }
}
