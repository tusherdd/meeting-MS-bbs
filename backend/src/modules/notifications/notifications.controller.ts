import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ApiPaginatedResponse,
  type PaginatedResponseDto,
} from '../../common/dto/paginated-response.dto';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import type { AuthUser } from '../../common/types/auth-user';
import {
  MarkAllReadResponseDto,
  NotificationQueryDto,
  NotificationResponseDto,
  UnreadCountDto,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'My notifications, newest first (`?unread=true` = only unread)',
  })
  @ApiPaginatedResponse(NotificationResponseDto)
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: NotificationQueryDto,
  ): Promise<PaginatedResponseDto<NotificationResponseDto>> {
    return this.notifications.listMine(user.id, query);
  }

  // Static paths before ':id'.
  @Get('unread-count')
  @ApiOperation({ summary: 'Number for the bell badge' })
  @ApiOkResponse({ type: UnreadCountDto })
  async unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCountDto> {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all my notifications read' })
  @ApiOkResponse({ type: MarkAllReadResponseDto })
  async readAll(
    @CurrentUser() user: AuthUser,
  ): Promise<MarkAllReadResponseDto> {
    return { updated: await this.notifications.markAllRead(user.id) };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one of my notifications read' })
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiNotFoundResponse({ description: 'Not found, or not mine' })
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIdPipe) id: string,
  ): Promise<NotificationResponseDto> {
    return this.notifications.markRead(user.id, id);
  }
}
