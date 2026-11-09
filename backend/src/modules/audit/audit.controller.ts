import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ApiPaginatedResponse,
  type PaginatedResponseDto,
} from '../../common/dto/paginated-response.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { AuditQueryService } from './audit-query.service';
import { AuditLogItemDto, AuditLogQueryDto } from './dto/audit-log.dto';

@ApiTags('Admin — audit log')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @ApiOperation({
    summary: 'Audit trail, newest first (ADMIN)',
    description:
      'Filters: actorId, action, entityType, entityId, from, to. `before`/`after` never contain secrets; phone numbers are masked.',
  })
  @ApiPaginatedResponse(AuditLogItemDto)
  @ApiForbiddenResponse({ description: 'Not an admin' })
  list(
    @Query() query: AuditLogQueryDto,
  ): Promise<PaginatedResponseDto<AuditLogItemDto>> {
    return this.audit.list(query);
  }
}
