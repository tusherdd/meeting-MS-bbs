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
  ApiTags,
} from '@nestjs/swagger';
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

const RULE =
  'Conflict rule: for every overlapping SCHEDULED meeting that shares a person (organizer, chair or participant): ' +
  "if this meeting has a SMALLER priority number (higher rank) it is saved and the other meeting's people are asked " +
  'to cancel/reschedule; equal or larger number → 409 and nothing is saved. Touching times (11:00–12:00 after 10:00–11:00) do not clash.';

@ApiTags('Meetings')
@ApiBearerAuth()
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

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
    description: 'Blocked by an equal/higher-priority meeting',
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
    summary: 'Update (organizer or ADMIN; not after the meeting ended)',
    description: `Re-runs the engine when time or people change. ${RULE}`,
  })
  @ApiOkResponse({ type: MeetingDetailDto })
  @ApiForbiddenResponse({ description: 'Not the organizer / admin' })
  @ApiNotFoundResponse({ description: 'Not found or not visible' })
  @ApiConflictResponse({
    type: MeetingConflictErrorDto,
    description: 'Blocked, cancelled/completed, or already ended',
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
      'Cancel with a reason (organizer or ADMIN); resolves its conflicts',
  })
  @ApiOkResponse({ type: MeetingDetailDto })
  @ApiForbiddenResponse({ description: 'Not the organizer / admin' })
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
