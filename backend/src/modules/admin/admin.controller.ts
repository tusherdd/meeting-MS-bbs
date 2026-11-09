import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminStatsService } from './admin-stats.service';
import { AdminStatsDto } from './dto/admin-stats.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly stats: AdminStatsService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Dashboard counters (ADMIN)',
    description:
      'Users, meetings today / this week (Asia/Dhaka), pending conflicts and change requests, failed mails.',
  })
  @ApiOkResponse({ type: AdminStatsDto })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  get(): Promise<AdminStatsDto> {
    return this.stats.stats();
  }
}
