import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ApiPaginatedResponse,
  type PaginatedResponseDto,
} from '../../common/dto/paginated-response.dto';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import type { AppRequest, AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../users/enums/user-role.enum';
import {
  CancelMeetingDto,
  CheckConflictsDto,
  CompleteMeetingDto,
  CreateMeetingDto,
  MeetingQueryDto,
  UpdateMeetingDto,
} from './dto/meeting-input.dto';
import {
  CheckConflictsResponseDto,
  MeetingConflictErrorDto,
  MeetingDetailDto,
  MeetingSummaryDto,
} from './dto/meeting-response.dto';
import { MeetingsService } from './meetings.service';
import { MeetingNoticeService } from './notice/meeting-notice.service';

/** PDF rendering is expensive: the same tighter limit as the report PDFs. */
const PDF_THROTTLE = { default: { limit: 10, ttl: minutes(1) } };

const RULE =
  'Conflict rule (v1.12): the ONLY blocking clash is the organizer rule: the organizer is, at an overlapping time, ' +
  'the organizer or the internal chair of another SCHEDULED meeting → 409 and nothing is saved (on edit only when the time changes; ' +
  'priority plays no role). Every other overlap that shares an officer (chair, members, the organizer as a member elsewhere) ' +
  'is a warning, whatever the priorities: the meeting is saved, a PENDING duplicate-meeting record is kept per shared officer, ' +
  'and the shared officers plus the lower-priority organizer (both organizers on equal priority) are informed. ' +
  'Guest officers are never checked. Touching times (11:00–12:00 after 10:00–11:00) do not clash.';

@ApiTags('Meetings')
@ApiBearerAuth()
@Controller('meetings')
export class MeetingsController {
  constructor(
    private readonly meetings: MeetingsService,
    private readonly notices: MeetingNoticeService,
  ) {}

  @Get('today')
  @ApiOperation({
    summary:
      'My meetings today (Asia/Dhaka day), ordered by start — dashboard default',
  })
  @ApiOkResponse({ type: [MeetingSummaryDto] })
  today(@CurrentUser() user: AuthUser): Promise<MeetingSummaryDto[]> {
    return this.meetings.today(user);
  }

  @Get()
  @ApiOperation({
    summary: 'My meetings by range',
    description:
      'Example: `?from=2026-12-01T00:00:00%2B06:00&to=2026-12-08T00:00:00%2B06:00&status=SCHEDULED&role=organizer`. ' +
      'ADMIN may pass `scope=all`.',
  })
  @ApiPaginatedResponse(MeetingSummaryDto)
  @ApiForbiddenResponse({ description: 'scope=all without admin rights' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: MeetingQueryDto,
  ): Promise<PaginatedResponseDto<MeetingSummaryDto>> {
    return this.meetings.list(user, query);
  }

  @Post('check-conflicts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dry run of the conflict engine (nothing is saved)',
    description: `${RULE} When editing, send \`meetingId\`.`,
  })
  @ApiOkResponse({ type: CheckConflictsResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid times or people' })
  checkConflicts(
    @CurrentUser() user: AuthUser,
    @Body() dto: CheckConflictsDto,
  ): Promise<CheckConflictsResponseDto> {
    return this.meetings.checkConflicts(user, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Meeting detail with people, chair and conflicts (its people and admins only)',
  })
  @ApiOkResponse({ type: MeetingDetailDto })
  @ApiNotFoundResponse({
    description: 'Not found — also when you are not one of its people',
  })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
  ): Promise<MeetingDetailDto> {
    return this.meetings.findOne(user, id);
  }

  @Throttle(PDF_THROTTLE)
  @Get(':id/notice.pdf')
  @ApiOperation({
    summary: 'Meeting notice "সভার নোটিশ" as PDF (v1.10)',
    description:
      'A4, always Bangla (Bangla digits), no logo. Signed by the user who exports it; distribution ' +
      'list = every internal officer by designation priority, then the guest officers. Allowed for ' +
      "the meeting's people and admins; not for cancelled meetings. File name " +
      '`meeting-notice-YYYY-MM-DD-<shortid>.pdf`. Audited as MEETING_NOTICE_EXPORTED.',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'A4 PDF (Bangla), downloaded as an attachment',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiForbiddenResponse({
    description: 'Not one of the meeting’s people and not an admin',
  })
  @ApiNotFoundResponse({ description: 'Meeting not found' })
  @ApiConflictResponse({ description: 'The meeting is cancelled' })
  @ApiServiceUnavailableResponse({
    description: 'PDF rendering took longer than 30 s',
  })
  async noticePdf(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.notices.noticePdf(user, id, req.ip ?? null);
    // The file name is ASCII only (fixed text, date digits, hex id), never user input.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(file.content);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a meeting (you are the organizer; priority = your designation priority now)',
    description: RULE,
  })
  @ApiCreatedResponse({ type: MeetingDetailDto })
  @ApiBadRequestResponse({ description: 'Validation: times, duration, people' })
  @ApiForbiddenResponse({
    description: 'SUPER_ADMIN (system account) cannot organize',
  })
  @ApiConflictResponse({
    type: MeetingConflictErrorDto,
    description:
      'The organizer is already the organizer or chair of another meeting at this time',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMeetingDto,
    @Req() req: AppRequest,
  ): Promise<MeetingDetailDto> {
    return this.meetings.create(user, dto, req.ip ?? null);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update (organizer, internal chair or ADMIN; not after the meeting ended)',
    description: `Re-runs the engine when time or people change. ${RULE}`,
  })
  @ApiOkResponse({ type: MeetingDetailDto })
  @ApiForbiddenResponse({ description: 'Not the organizer / chair / admin' })
  @ApiNotFoundResponse({ description: 'Not found or not visible' })
  @ApiConflictResponse({
    type: MeetingConflictErrorDto,
    description:
      'Organizer rule (organizer or chair of another meeting at the new time), cancelled/completed, or already ended',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateMeetingDto,
    @Req() req: AppRequest,
  ): Promise<MeetingDetailDto> {
    return this.meetings.update(user, id, dto, req.ip ?? null);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancel with a reason (organizer, internal chair or ADMIN); resolves its conflicts',
  })
  @ApiOkResponse({ type: MeetingDetailDto })
  @ApiForbiddenResponse({ description: 'Not the organizer / chair / admin' })
  @ApiNotFoundResponse({ description: 'Not found or not visible' })
  @ApiConflictResponse({ description: 'Not SCHEDULED' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: CancelMeetingDto,
    @Req() req: AppRequest,
  ): Promise<MeetingDetailDto> {
    return this.meetings.cancel(user, id, dto, req.ip ?? null);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark completed and save notes/minutes (after the start; organizer or ADMIN)',
  })
  @ApiOkResponse({ type: MeetingDetailDto })
  @ApiForbiddenResponse({ description: 'Not the organizer / admin' })
  @ApiConflictResponse({ description: 'Not started yet, or cancelled' })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: CompleteMeetingDto,
    @Req() req: AppRequest,
  ): Promise<MeetingDetailDto> {
    return this.meetings.complete(user, id, dto, req.ip ?? null);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hard delete (ADMIN); participants and conflicts are deleted too',
  })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  @ApiNotFoundResponse({ description: 'Not found' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
    @Req() req: AppRequest,
  ): Promise<void> {
    await this.meetings.remove(user, id, req.ip ?? null);
  }
}
