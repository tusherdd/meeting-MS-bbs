import {
  Body,
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
  ApiBadRequestResponse,
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
import { ChangeRequestsService } from './change-requests.service';
import {
  ApproveChangeRequestDto,
  ChangeRequestQueryDto,
  ChangeRequestResponseDto,
  RejectChangeRequestDto,
} from './dto/change-request.dto';

@ApiTags('Change requests (admin)')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('change-requests')
export class ChangeRequestsController {
  constructor(private readonly changeRequests: ChangeRequestsService) {}

  @Get()
  @ApiOperation({
    summary: 'List change requests with current vs requested value (ADMIN)',
    description: 'Example: `?status=PENDING&type=DESIGNATION&page=1&limit=20`',
  })
  @ApiPaginatedResponse(ChangeRequestResponseDto)
  @ApiForbiddenResponse({ description: 'Not an admin' })
  list(
    @Query() query: ChangeRequestQueryDto,
  ): Promise<PaginatedResponseDto<ChangeRequestResponseDto>> {
    return this.changeRequests.list(query);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve: re-validate and apply the change (ADMIN)',
    description:
      'LOGIN_EMAIL: the email must still be free; the user is logged out everywhere and both ' +
      'addresses get a mail. DESIGNATION: the designation must still be active. You cannot ' +
      'approve your own request.',
  })
  @ApiOkResponse({ type: ChangeRequestResponseDto })
  @ApiForbiddenResponse({ description: 'Not an admin, or your own request' })
  @ApiNotFoundResponse({ description: 'Request not found' })
  @ApiConflictResponse({
    description:
      'Already decided, email taken meanwhile, or designation no longer active',
  })
  approve(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: ApproveChangeRequestDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<ChangeRequestResponseDto> {
    return this.changeRequests.approve(user, id, dto, req.ip ?? null);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject with a required note (ADMIN)' })
  @ApiOkResponse({ type: ChangeRequestResponseDto })
  @ApiBadRequestResponse({ description: 'Note missing or too short' })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  @ApiNotFoundResponse({ description: 'Request not found' })
  @ApiConflictResponse({ description: 'Already decided' })
  reject(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: RejectChangeRequestDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<ChangeRequestResponseDto> {
    return this.changeRequests.reject(user, id, dto, req.ip ?? null);
  }
}
