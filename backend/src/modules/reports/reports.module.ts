import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from '../meetings/entities/meeting.entity';
import { PdfService } from './pdf/pdf.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([Meeting])],
  controllers: [ReportsController],
  providers: [ReportsService, PdfService],
})
export class ReportsModule {}
