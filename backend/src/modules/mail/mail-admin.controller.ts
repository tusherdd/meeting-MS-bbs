import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
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
  EmailOutboxItemDto,
  EmailOutboxQueryDto,
} from './dto/email-outbox.dto';
import { MailAdminService } from './mail-admin.service';

@ApiTags('Admin — email outbox')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/email-outbox')
export class MailAdminController {
  constructor(private readonly mailAdmin: MailAdminService) {}

  @Get()
  @ApiOperation({
    summary: 'Mail queue status (ADMIN)',
    description:
      'Filter with `?status=FAILED`. Shows recipient, subject, status, attempts, last error and dates — never the mail body.',
  })
  @ApiPaginatedResponse(EmailOutboxItemDto)
  @ApiForbiddenResponse({ description: 'Not an admin' })
  list(
    @Query() query: EmailOutboxQueryDto,
  ): Promise<PaginatedResponseDto<EmailOutboxItemDto>> {
    return this.mailAdmin.list(query);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry one FAILED mail (ADMIN)',
    description:
      'Sets it back to PENDING with 0 attempts; the worker sends it within a minute.',
  })
  @ApiOkResponse({ type: EmailOutboxItemDto })
  @ApiNotFoundResponse({ description: 'Mail not found' })
  @ApiConflictResponse({ description: 'Only FAILED mail can be retried' })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  retry(
    @Param('id', ParseIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<EmailOutboxItemDto> {
    return this.mailAdmin.retry(id, user.id, req.ip ?? null);
  }
}
