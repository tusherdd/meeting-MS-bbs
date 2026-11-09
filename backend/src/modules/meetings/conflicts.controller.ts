import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
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
import type { AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../users/enums/user-role.enum';
import { ConflictsService } from './conflicts.service';
import { ConflictQueryDto } from './dto/meeting-input.dto';
import { ConflictListItemDto } from './dto/meeting-response.dto';

@ApiTags('Conflicts')
@ApiBearerAuth()
@Controller('conflicts')
export class ConflictsController {
  constructor(private readonly conflicts: ConflictsService) {}

  @Get('mine')
  @ApiOperation({
    summary:
      'Pending conflicts on meetings I organize (lower meeting) or where I am the shared officer',
  })
  @ApiOkResponse({ type: [ConflictListItemDto] })
  mine(@CurrentUser() user: AuthUser): Promise<ConflictListItemDto[]> {
    return this.conflicts.mine(user);
  }

  @Roles(UserRole.ADMIN)
  @Get()
  @ApiOperation({ summary: 'All conflicts (ADMIN), `?status=PENDING`' })
  @ApiPaginatedResponse(ConflictListItemDto)
  @ApiForbiddenResponse({ description: 'Not an admin' })
  all(
    @CurrentUser() user: AuthUser,
    @Query() query: ConflictQueryDto,
  ): Promise<PaginatedResponseDto<ConflictListItemDto>> {
    return this.conflicts.all(user, query);
  }
}
