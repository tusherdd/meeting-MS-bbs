import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { DOCX_MIME, fileDisposition } from '../decisions/decision-file';
import { AttachmentUploadErrorsInterceptor } from './attachment-upload-errors.interceptor';
import {
  AttachmentsService,
  type IncomingAttachmentFile,
} from './attachments.service';
import {
  AttachmentDto,
  AttachmentListDto,
  AttachmentUploadDto,
  AttachmentUploadFieldsDto,
} from './dto/attachment.dto';

/** Uploads are counted per user: at most 30 upload requests per hour (like the notice). */
const UPLOAD_THROTTLE = { default: { limit: 30, ttl: hours(1) } };

const binary = { schema: { type: 'string', format: 'binary' } };

/** "অন্যান্য সংযুক্তি" / other attachments of a meeting (v1.17, SPEC.md §6.11). */
@ApiTags('Meeting attachments')
@ApiBearerAuth()
@Controller('meetings/:id/attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List the other attachments of a meeting',
    description:
      "The meeting's people, admins and office report viewers in scope (like the notice), also for " +
      'cancelled meetings. `canManage` = I may add / remove (the organizer, not cancelled).',
  })
  @ApiOkResponse({ type: AttachmentListDto })
  @ApiForbiddenResponse({
    description: 'Not one of the meeting’s people / not an admin',
  })
  @ApiNotFoundResponse({ description: 'Meeting not found' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
  ): Promise<AttachmentListDto> {
    return this.attachments.list(user, id);
  }

  @Throttle(UPLOAD_THROTTLE)
  @Post()
  @UseInterceptors(AttachmentUploadErrorsInterceptor, FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: AttachmentUploadDto })
  @ApiOperation({
    summary: 'Add an attachment (organizer only)',
    description:
      'Multipart fields `name` (label, required, max 150) and `file`. PDF, DOCX (no macros), JPEG or PNG, ' +
      'checked by the bytes; max 10 MB; image metadata removed; at most 5 per meeting. Only the organizer ' +
      '(not the chair, not admins); not for cancelled meetings. Audited (MEETING_ATTACHMENT_ADDED).',
  })
  @ApiCreatedResponse({ type: AttachmentDto })
  @ApiBadRequestResponse({
    description:
      'No name or file, wrong type, macro-enabled Word file, unreadable',
  })
  @ApiForbiddenResponse({ description: 'Not the organizer' })
  @ApiNotFoundResponse({ description: 'Meeting not found' })
  @ApiConflictResponse({
    description: 'Meeting cancelled, or already 5 attachments',
  })
  @ApiPayloadTooLargeResponse({ description: 'File larger than 10 MB' })
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: AttachmentUploadFieldsDto,
    @UploadedFile() file: IncomingAttachmentFile | undefined,
    @Req() req: AppRequest,
  ): Promise<AttachmentDto> {
    return this.attachments.upload(user, id, body.name, file, req.ip ?? null);
  }

  @Get(':attachmentId')
  @ApiOperation({
    summary:
      'Download or show one attachment (PDF / image inline, DOCX attachment)',
    description:
      'Same viewers as the list. The type decides the disposition: PDF and images inline (file viewer ' +
      'panel), a DOCX always an attachment. Sent with nosniff, no-store and a safe Content-Disposition.',
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
  @ApiNotFoundResponse({ description: 'Meeting or attachment not found' })
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('attachmentId', ParseIdPipe) attachmentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, stream } = await this.attachments.download(
      user,
      id,
      attachmentId,
    );
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader(
      'Content-Disposition',
      fileDisposition(file.originalName, file.mime, 'meeting-attachment'),
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(stream);
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove an attachment (organizer only)',
    description:
      'Not for cancelled meetings. Audited (MEETING_ATTACHMENT_REMOVED).',
  })
  @ApiNoContentResponse({ description: 'Removed' })
  @ApiForbiddenResponse({ description: 'Not the organizer' })
  @ApiNotFoundResponse({ description: 'Meeting or attachment not found' })
  @ApiConflictResponse({ description: 'Meeting cancelled' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('attachmentId', ParseIdPipe) attachmentId: string,
    @Req() req: AppRequest,
  ): Promise<void> {
    await this.attachments.remove(user, id, attachmentId, req.ip ?? null);
  }
}
