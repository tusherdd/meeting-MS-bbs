import { Module } from '@nestjs/common';
import { AdminStatsService } from './admin-stats.service';
import { AdminController } from './admin.controller';

@Module({
  controllers: [AdminController],
  providers: [AdminStatsService],
})
export class AdminModule {}
