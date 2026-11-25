import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AppRequest, AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../users/enums/user-role.enum';
import { AppSettingsDto, UpdateAppSettingsDto } from './dto/app-settings.dto';
import { SettingsService } from './settings.service';

/** App-wide settings (v1.21 part 2, SPEC.md §6.13). ADMIN / SUPER_ADMIN only. */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'App settings (ADMIN)',
    description:
      'noticeExtractionMethod (OCR | AI) and whether the AI option is available (ANTHROPIC_API_KEY set; the key is never returned).',
  })
  @ApiOkResponse({ type: AppSettingsDto })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  get(): Promise<AppSettingsDto> {
    return this.service.get();
  }

  @Patch()
  @ApiOperation({
    summary: 'Change app settings (ADMIN)',
    description:
      'Sets noticeExtractionMethod. AI is refused (400) while ANTHROPIC_API_KEY is not set. Audited (SETTING_CHANGED).',
  })
  @ApiOkResponse({ type: AppSettingsDto })
  @ApiBadRequestResponse({
    description: 'Invalid value, or AI without an API key',
  })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateAppSettingsDto,
    @Req() req: AppRequest,
  ): Promise<AppSettingsDto> {
    return this.service.update(user, dto, req.ip ?? null);
  }
}
