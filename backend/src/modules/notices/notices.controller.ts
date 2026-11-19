import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { hours, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import type { AppRequest, AuthUser } from '../../common/types/auth-user';
import {
  contentDisposition,
  DOCX_MIME,
  mayOpenInline,
} from '../decisions/decision-file';
import {
  NoticeDownloadQueryDto,
  NoticeFileDto,
  NoticeUploadDto,
} from './dto/notice.dto';
import { NoticeUploadErrorsInterceptor } from './notice-upload-errors.interceptor';
import { NoticesService, type IncomingNoticeFile } from './notices.service';

/** Uploads are counted per user: at most 30 upload requests per hour (like the minutes). */
const UPLOAD_THROTTLE = { default: { limit: 30, ttl: hours(1) } };

const binary = { schema: { type: 'string', format: 'binary' } };

/** The uploaded meeting notice "সভার নোটিশ" (v1.13, SPEC.md §6.8). */
@ApiTags('Meeting notice')
@ApiBearerAuth()
@Controller('meetings/:id/notice')
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Throttle(UPLOAD_THROTTLE)
  @Post()
  @UseInterceptors(NoticeUploadErrorsInterceptor, FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: NoticeUploadDto })
  @ApiOperation({
    summary: 'Upload or replace the meeting notice (organizer only)',
    description:
      'One file per meeting: a new upload replaces the old one. PDF, DOCX (no macros), JPEG or PNG, ' +
      'checked by the bytes (legacy .doc and everything else refused); max 10 MB; image metadata removed. ' +
      'Only the organizer (not the chair, not admins); not for cancelled meetings. Audited ' +
      '(MEETING_NOTICE_UPLOADED / MEETING_NOTICE_REPLACED).',
  })
  @ApiCreatedResponse({ type: NoticeFileDto })
  @ApiBadRequestResponse({
    description: 'No file, wrong type, macro-enabled Word file, unreadable',
  })
  @ApiForbiddenResponse({ description: 'Not the organizer' })
  @ApiNotFoundResponse({ description: 'Meeting not found' })
  @ApiConflictResponse({ description: 'Meeting cancelled' })
  @ApiPayloadTooLargeResponse({ description: 'File larger than 10 MB' })
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @UploadedFile() file: IncomingNoticeFile | undefined,
    @Req() req: AppRequest,
  ): Promise<NoticeFileDto> {
    return this.notices.upload(user, id, file, req.ip ?? null);
  }

  @Get()
  @ApiOperation({
    summary:
      'Download (PDF / image: or with ?inline=true open) the meeting notice',
    description:
      "The meeting's people and admins, also for cancelled meetings. A DOCX is always an attachment. " +
      'Sent with nosniff, no-store and a safe Content-Disposition.',
  })
  @ApiProduces('application/pdf', DOCX_MIME, 'image/jpeg', 'image/png')
  @ApiOkResponse({
    description: 'The file',
    content: {
      'application/pdf': binary,
      [DOCX_MIME]: binary,
      'image/jpeg': binary,
      'image/png': binary,
    },
  })
  @ApiForbiddenResponse({
    description: 'Not one of the meeting’s people / not an admin',
  })
  @ApiNotFoundResponse({ description: 'Meeting not found or it has no notice' })
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Query() query: NoticeDownloadQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, stream } = await this.notices.download(user, id);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader(
      'Content-Disposition',
      contentDisposition(
        file.originalName,
        query.inline === true && mayOpenInline(file.mime),
      ),
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(stream);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove the meeting notice (organizer only)',
    description:
      'Not for cancelled meetings. Audited (MEETING_NOTICE_REMOVED).',
  })
  @ApiNoContentResponse({ description: 'Removed' })
  @ApiForbiddenResponse({ description: 'Not the organizer' })
  @ApiNotFoundResponse({ description: 'Meeting not found or it has no notice' })
  @ApiConflictResponse({ description: 'Meeting cancelled' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: AppRequest,
  ): Promise<void> {
    await this.notices.remove(user, id, req.ip ?? null);
  }
}
