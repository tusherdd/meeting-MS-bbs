import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  SkipThrottle,
  ThrottlerStorage,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import type { EnvVars } from '../../config/env.validation';
import { UserRole } from '../users/enums/user-role.enum';
import { testHooksEnabled } from './test-hooks.guard';

/**
 * POST /api/v1/test-hooks/reset-throttle (admin, test environments only): empties the
 * in-memory rate-limit counters, e.g. "5 verification mails per hour" (PROFILE_THROTTLE),
 * so repeated Playwright runs do not wait an hour. Not in Swagger / docs/API.md.
 */
@ApiExcludeController()
@Controller('test-hooks')
@Roles(UserRole.ADMIN)
@SkipThrottle()
export class TestHooksController {
  constructor(
    @Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
    private readonly config: ConfigService<EnvVars, true>,
  ) {}

  @Post('reset-throttle')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetThrottle(): void {
    // Second line of defence: the module is never loaded in production anyway.
    const enabled = testHooksEnabled({
      NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
      E2E_TEST_HOOKS: String(
        this.config.get('E2E_TEST_HOOKS', { infer: true }),
      ),
    });
    if (!enabled) throw new NotFoundException();
    // @nestjs/throttler 6.7 keeps every hit's expiry in a second (private) map and rebuilds the
    // count from it on the next request, so clearing `storage` alone resets nothing. The public
    // onApplicationShutdown() empties both maps and stops the sweep timer; the next increment()
    // starts the timer again.
    if (this.storage instanceof ThrottlerStorageService)
      this.storage.onApplicationShutdown();
  }
}
