import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from '../meetings/entities/meeting.entity';
import { OfficeScopeModule } from '../office-scope/office-scope.module';
import { OfficeReportService } from './office-report.service';
import { PdfModule } from './pdf/pdf.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([Meeting]), PdfModule, OfficeScopeModule],
  controllers: [ReportsController],
  providers: [ReportsService, OfficeReportService],
})
export class ReportsModule {}
