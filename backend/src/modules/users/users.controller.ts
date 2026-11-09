import {
  Body,
  Controller,
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
import { CreateUserDto } from './dto/create-user.dto';
import {
  UpdateUserDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/update-user.dto';
import { DirectoryQueryDto, UsersQueryDto } from './dto/user-query.dto';
import {
  DirectoryEntryDto,
  UserDetailDto,
  UserMessageResponseDto,
  UserSummaryDto,
} from './dto/user-response.dto';
import { UserRole } from './enums/user-role.enum';
import { USER_MESSAGES } from './users.messages';
import { UsersService, type ActionContext } from './users.service';

const ADMIN_ONLY = 'Only ADMIN or SUPER_ADMIN';
const PROTECTED =
  'Not an admin, or a protection rule: SUPER_ADMIN account / own role / own deactivation';

function ctx(user: AuthUser, req: AppRequest): ActionContext {
  return { actor: user, ip: req.ip ?? null };
}

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Declared before ':id' so "directory" is not parsed as an id.
  @Get('directory')
  @ApiOperation({
    summary:
      'Active officer directory for the participant picker (any logged-in user)',
    description:
      'Only id, names, designation (name + priority), wing and photo. No email, phone or role.',
  })
  @ApiPaginatedResponse(DirectoryEntryDto)
  directory(
    @Query() query: DirectoryQueryDto,
  ): Promise<PaginatedResponseDto<DirectoryEntryDto>> {
    return this.users.directory(query);
  }

  @Roles(UserRole.ADMIN)
  @Get()
  @ApiOperation({
    summary: 'Search / filter / sort / paginate users (ADMIN)',
    description:
      'Example: `?q=rahim&isActive=true&sortBy=nameEn&sortOrder=asc&page=1&limit=20`. ' +
      '`q` matches Bangla/English name, login email and mobile (Bangla digits allowed).',
  })
  @ApiPaginatedResponse(UserSummaryDto)
  @ApiForbiddenResponse({ description: ADMIN_ONLY })
  list(
    @Query() query: UsersQueryDto,
  ): Promise<PaginatedResponseDto<UserSummaryDto>> {
    return this.users.list(query);
  }

  @Roles(UserRole.ADMIN)
  @Get(':id')
  @ApiOperation({ summary: 'Full user (ADMIN)' })
  @ApiOkResponse({ type: UserDetailDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: ADMIN_ONLY })
  findOne(@Param('id', ParseIdPipe) id: string): Promise<UserDetailDto> {
    return this.users.findOne(id);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  @ApiOperation({
    summary: 'Create an officer (ADMIN)',
    description:
      'Sets the default officer password (DEFAULT_OFFICER_PASSWORD, never returned), passwordIsDefault = true, no forced change; the welcome mail names "the default password the office announced" and never contains it.',
  })
  @ApiCreatedResponse({ type: UserDetailDto })
  @ApiBadRequestResponse({
    description: 'Validation error / inactive designation or wing',
  })
  @ApiForbiddenResponse({ description: ADMIN_ONLY })
  @ApiConflictResponse({ description: 'Login email already used' })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<UserDetailDto> {
    return this.users.create(dto, ctx(user, req));
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit any profile field, including loginEmail and designation (ADMIN)',
    description:
      'Send only the fields to change. `null` clears an optional field. `additionalCharges` replaces the whole list. Role and status have their own endpoints.',
  })
  @ApiOkResponse({ type: UserDetailDto })
  @ApiBadRequestResponse({
    description: 'Validation error / inactive designation or wing',
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: PROTECTED })
  @ApiConflictResponse({ description: 'Login email already used' })
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<UserDetailDto> {
    return this.users.update(id, dto, ctx(user, req));
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Activate / deactivate (ADMIN)',
    description:
      'Deactivation revokes all refresh tokens; the user is blocked immediately.',
  })
  @ApiOkResponse({ type: UserDetailDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: PROTECTED })
  setStatus(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<UserDetailDto> {
    return this.users.setStatus(id, dto, ctx(user, req));
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/role')
  @ApiOperation({
    summary: 'Make ADMIN or OFFICER (ADMIN). SUPER_ADMIN is untouchable.',
  })
  @ApiOkResponse({ type: UserDetailDto })
  @ApiBadRequestResponse({ description: 'Role must be ADMIN or OFFICER' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: PROTECTED })
  setRole(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<UserDetailDto> {
    return this.users.setRole(id, dto, ctx(user, req));
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset to the default officer password (ADMIN)',
    description:
      'Sets the default officer password (never returned or mailed), passwordIsDefault = true, no forced change. All sessions end and open reset links close; the user gets a notice mail.',
  })
  @ApiOkResponse({ type: UserMessageResponseDto })
  @ApiBadRequestResponse({ description: 'Account is inactive' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: PROTECTED })
  async resetPassword(
    @Param('id', ParseIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<UserMessageResponseDto> {
    await this.users.resetPassword(id, ctx(user, req));
    return { message: USER_MESSAGES.passwordResetDone };
  }
}
