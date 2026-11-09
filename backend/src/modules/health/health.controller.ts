import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { HealthResponseDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

@ApiTags('Health')
@Public() // monitoring must work without login
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'API and database status (public)' })
  @ApiOkResponse({
    type: HealthResponseDto,
    description: 'API is up and the database answers',
  })
  @ApiServiceUnavailableResponse({
    type: HealthResponseDto,
    description: 'Database is unreachable',
  })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponseDto> {
    const result = await this.healthService.check();
    if (result.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
