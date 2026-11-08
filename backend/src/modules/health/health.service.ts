import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  DatabaseHealthDto,
  HealthResponseDto,
} from './dto/health-response.dto';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<HealthResponseDto> {
    const database = await this.pingDatabase();
    return {
      status: database.status === 'up' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database,
    };
  }

  private async pingDatabase(): Promise<DatabaseHealthDto> {
    const startedAt = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (err) {
      // Details stay in the server log; the public response only says "down".
      this.logger.warn(
        `Database ping failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { status: 'down', latencyMs: null };
    }
  }
}
