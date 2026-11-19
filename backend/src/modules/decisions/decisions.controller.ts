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
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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
import {
  ApiPaginatedResponse,
  type PaginatedResponseDto,
} from '../../common/dto/paginated-response.dto';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import type { AppRequest, AuthUser } from '../../common/types/auth-user';
import { MeetingSummaryDto } from '../meetings/dto/meeting-response.dto';
import { contentDisposition, DOCX_MIME, mayOpenInline } from './decision-file';
import { MAX_DECISION_FILES } from './decision-rules';
import { DecisionUploadErrorsInterceptor } from './decision-upload-errors.interceptor';
import { DecisionsService, type IncomingFile } from './decisions.service';
import {
  DecisionDetailDto,
  DecisionDownloadQueryDto,
  DecisionListQueryDto,
  DecisionSummaryDto,
  DecisionUploadDto,
} from './dto/decision.dto';

/** Uploads are counted per user: at most 30 upload requests per hour. */
const UPLOAD_THROTTLE = { default: { limit: 30, ttl: hours(1) } };

/** Meeting minutes "সভা কার্যবিবরণী" (v1.11 as decisions, renamed v1.13; SPEC.md §6.9). */
@ApiTags('Meeting minutes')
@ApiBearerAuth()
@Controller()
export class DecisionsController {
  constructor(private readonly decisions: DecisionsService) {}

  @Get('decisions/summary')
  @ApiOperation({
    summary:
      'Pending / Complete decision counts of the meetings I organize or chair (sidebar, dashboard)',
  })
  @ApiOkResponse({ type: DecisionSummaryDto })
  summary(@CurrentUser() user: AuthUser): Promise<DecisionSummaryDto> {
    return this.decisions.summary(user);
  }

  @Get('decisions')
  @ApiOperation({
    summary: 'Meetings by decision status',
    description:
      '`as=lead` (default): meetings I organize or chair, `status=PENDING|COMPLETE`. ' +
      '`as=member`: meetings where I am only a member and the decision is Pending. Cancelled meetings never appear.',
  })
  @ApiPaginatedResponse(MeetingSummaryDto)
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: DecisionListQueryDto,
  ): Promise<PaginatedResponseDto<MeetingSummaryDto>> {
    return this.decisions.list(user, query);
  }

  @Get('meetings/:id/decision')
  @ApiOperation({
    summary: 'Decision of a meeting: status, files and what I may do',
    description: "The meeting's people and admins.",
  })
  @ApiOkResponse({ type: DecisionDetailDto })
  @ApiForbiddenResponse({
    description: 'Not one of the meeting’s people / not an admin',
  })
  @ApiNotFoundResponse({ description: 'Meeting not found' })
  detail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
  ): Promise<DecisionDetailDto> {
    return this.decisions.detail(user, id);
  }

  @Throttle(UPLOAD_THROTTLE)
  @Post('meetings/:id/decision/files')
  @UseInterceptors(
    DecisionUploadErrorsInterceptor,
    FilesInterceptor('files', MAX_DECISION_FILES),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: DecisionUploadDto })
  @ApiOperation({
    summary:
      'Upload decision files (organizer, chair, members; after the start)',
    description:
      'PDF, DOCX (no macros; v1.13), JPEG or PNG only, checked by their bytes; max 10 MB each, max 10 per meeting. Image ' +
      'metadata is removed. Not before the start, never for cancelled meetings. Organizer and chair ' +
      '(not the uploader) get a bell notification. Audited per file.',
  })
  @ApiCreatedResponse({ type: DecisionDetailDto })
  @ApiBadRequestResponse({
    description: 'No file, wrong type, unreadable, too many files',
  })
  @ApiForbiddenResponse({
    description: 'Not the organizer / chair / a member (admins cannot upload)',
  })
  @ApiConflictResponse({ description: 'Meeting cancelled or not started yet' })
  @ApiPayloadTooLargeResponse({ description: 'A file is larger than 10 MB' })
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @UploadedFiles() files: IncomingFile[] | undefined,
    @Req() req: AppRequest,
  ): Promise<DecisionDetailDto> {
    return this.decisions.upload(user, id, files, req.ip ?? null);
  }

  @Get('meetings/:id/decision/files/:fileId')
  @ApiOperation({
    summary: 'Download (or with ?inline=true open) one minutes file',
    description:
      "The meeting's people and admins. Sent with nosniff, no-store and a safe Content-Disposition. A DOCX is always an attachment.",
  })
  @ApiProduces('application/pdf', DOCX_MIME, 'image/jpeg', 'image/png')
  @ApiOkResponse({
    description: 'The file',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
      [DOCX_MIME]: { schema: { type: 'string', format: 'binary' } },
      'image/jpeg': { schema: { type: 'string', format: 'binary' } },
      'image/png': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiForbiddenResponse({
    description: 'Not one of the meeting’s people / not an admin',
  })
  @ApiNotFoundResponse({ description: 'Meeting or file not found' })
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('fileId', ParseIdPipe) fileId: string,
    @Query() query: DecisionDownloadQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, stream } = await this.decisions.download(user, id, fileId);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader(
      'Content-Disposition',
      // v1.13: a DOCX is always an attachment, even with ?inline=true.
      contentDisposition(
        file.originalName,
        query.inline === true && mayOpenInline(file.mime),
      ),
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(stream);
  }

  @Delete('meetings/:id/decision/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a decision file (uploader, organizer or chair)',
    description:
      'Deleting the last file makes the decision Pending again. Audited.',
  })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiForbiddenResponse({ description: 'Not the uploader, organizer or chair' })
  @ApiNotFoundResponse({ description: 'Meeting or file not found' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Param('fileId', ParseIdPipe) fileId: string,
    @Req() req: AppRequest,
  ): Promise<void> {
    await this.decisions.remove(user, id, fileId, req.ip ?? null);
  }
}
