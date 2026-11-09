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
import { DesignationsService } from './designations.service';
import {
  CreateDesignationDto,
  DesignationListQueryDto,
  DesignationResponseDto,
  UpdateDesignationDto,
} from './dto/designation.dto';

@ApiTags('Designations')
@ApiBearerAuth()
@Controller('designations')
export class DesignationsController {
  constructor(private readonly designations: DesignationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List designations ordered by priority (any logged-in user)',
  })
  @ApiOkResponse({ type: [DesignationResponseDto] })
  list(
    @Query() query: DesignationListQueryDto,
  ): Promise<DesignationResponseDto[]> {
    return this.designations.list(query);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create a designation (ADMIN)' })
  @ApiCreatedResponse({ type: DesignationResponseDto })
  @ApiBadRequestResponse({ description: 'Validation error' })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  @ApiConflictResponse({
    description: 'English name already exists (case-insensitive)',
  })
  create(
    @Body() dto: CreateDesignationDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<DesignationResponseDto> {
    return this.designations.create(dto, user.id, req.ip ?? null);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  @ApiOperation({
    summary: 'Rename / change priority / (de)activate (ADMIN)',
    description:
      'A priority change is audited (DESIGNATION_PRIORITY_CHANGE, old → new). Existing meetings keep their stored priority (snapshot rule).',
  })
  @ApiOkResponse({ type: DesignationResponseDto })
  @ApiNotFoundResponse({ description: 'Designation not found' })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  @ApiConflictResponse({ description: 'English name already exists' })
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateDesignationDto,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<DesignationResponseDto> {
    return this.designations.update(id, dto, user.id, req.ip ?? null);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a designation that no user has (ADMIN)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Designation not found' })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  @ApiConflictResponse({
    description: 'Still used by users — deactivate it instead',
  })
  async remove(
    @Param('id', ParseIdPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: AppRequest,
  ): Promise<void> {
    await this.designations.remove(id, user.id, req.ip ?? null);
  }
}
