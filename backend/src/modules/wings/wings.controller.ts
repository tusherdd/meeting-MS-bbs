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
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import type { AppRequest, AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../users/enums/user-role.enum';
import {
  CreateWingDto,
  UpdateWingDto,
  WingListQueryDto,
  WingResponseDto,
} from './dto/wing.dto';
import { WingsService } from './wings.service';

@ApiTags('Wings')
@ApiBearerAuth()
@Controller('wings')
export class WingsController {
  constructor(private readonly wings: WingsService) {}

  @Get()
  @ApiOperation({
    summary: 'List wings ordered by English name (any logged-in user)',
  })
  @ApiOkResponse({ type: [WingResponseDto] })
  list(@Query() query: WingListQueryDto): Promise<WingResponseDto[]> {
    return this.wings.list(query);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create a wing (ADMIN)' })
  @ApiCreatedResponse({ type: WingResponseDto })
  @ApiBadRequestResponse({ description: 'Validation error' })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  @ApiConflictResponse({
    description: 'English name already exists (case-insensitive)',
  })
  create(
    @Body() dto: CreateWingDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<WingResponseDto> {
    return this.wings.create(dto, user.id, req.ip ?? null);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Rename / (de)activate a wing (ADMIN)' })
  @ApiOkResponse({ type: WingResponseDto })
  @ApiNotFoundResponse({ description: 'Wing not found' })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  @ApiConflictResponse({ description: 'English name already exists' })
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateWingDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<WingResponseDto> {
    return this.wings.update(id, dto, user.id, req.ip ?? null);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a wing that no user belongs to (ADMIN)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Wing not found' })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  @ApiConflictResponse({
    description: 'Still used by users — deactivate it instead',
  })
  async remove(
    @Param('id', ParseIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<void> {
    await this.wings.remove(id, user.id, req.ip ?? null);
  }
}
