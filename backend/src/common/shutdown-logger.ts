import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';

/**
 * Logs the start of a graceful shutdown (SIGTERM/SIGINT). Afterwards Nest runs the other
 * shutdown hooks: DB pool closed (TypeORM), PDF browser closed (PdfService), cron jobs
 * stopped (ScheduleModule).
 */
@Injectable()
export class ShutdownLogger implements BeforeApplicationShutdown {
  private readonly logger = new Logger('Shutdown');

  beforeApplicationShutdown(signal?: string): void {
    this.logger.log(
      `Graceful shutdown${signal ? ` (${signal})` : ''}: closing the PDF browser, cron jobs and database pool`,
    );
  }
}
