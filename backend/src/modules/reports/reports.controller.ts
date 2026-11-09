import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { UserRole } from '../users/enums/user-role.enum';
import {
  OfficeFilterDto,
  OfficeReportDto,
  OfficeReportQueryDto,
  PersonalReportDto,
  ReportPeriodQueryDto,
  ReportQueryDto,
} from './dto/report.dto';
import { ReportsService, type PdfFile } from './reports.service';

/** PDF rendering is expensive: a tighter per-IP limit. */
const PDF_THROTTLE = { default: { limit: 10, ttl: minutes(1) } };

const PDF_RESPONSE = {
  description: 'A4 PDF (Bangla), downloaded as an attachment',
  content: {
    'application/pdf': { schema: { type: 'string', format: 'binary' } },
  },
};

function sendPdf(res: Response, file: PdfFile): StreamableFile {
  // The file name is built from fixed text + digits only (see resolvePeriod), never user input.
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.filename}"`,
  );
  res.setHeader('Cache-Control', 'no-store');
  return new StreamableFile(file.content);
}

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('me')
  @ApiOperation({
    summary: 'My report: summary + meeting list for a period',
    description:
      'Meetings where I am organizer, chair or participant and that START in the period (Asia/Dhaka). ' +
      'Example: `?period=month&date=2026-12-01`.',
  })
  @ApiOkResponse({ type: PersonalReportDto })
  me(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportQueryDto,
  ): Promise<PersonalReportDto> {
    return this.reports.personal(user, query.period, query.date, query);
  }

  @Throttle(PDF_THROTTLE)
  @Get('me/pdf')
  @ApiOperation({ summary: 'My report as PDF' })
  @ApiProduces('application/pdf')
  @ApiOkResponse(PDF_RESPONSE)
  @ApiServiceUnavailableResponse({
    description: 'PDF rendering took longer than 30 s',
  })
  async mePdf(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportPeriodQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendPdf(
      res,
      await this.reports.personalPdf(user, query.period, query.date),
    );
  }

  @Roles(UserRole.ADMIN)
  @Get('office')
  @ApiOperation({
    summary:
      'Office-wide report (ADMIN), filterable by the organizer’s wing and designation',
  })
  @ApiOkResponse({ type: OfficeReportDto })
  @ApiForbiddenResponse({ description: 'Not an admin' })
  office(@Query() query: OfficeReportQueryDto): Promise<OfficeReportDto> {
    return this.reports.office(
      query.period,
      query.date,
      { wingId: query.wingId, designationId: query.designationId },
      query,
    );
  }

  @Roles(UserRole.ADMIN)
  @Throttle(PDF_THROTTLE)
  @Get('office/pdf')
  @ApiOperation({ summary: 'Office report as PDF (ADMIN)' })
  @ApiProduces('application/pdf')
  @ApiOkResponse(PDF_RESPONSE)
  @ApiForbiddenResponse({ description: 'Not an admin' })
  @ApiServiceUnavailableResponse({
    description: 'PDF rendering took longer than 30 s',
  })
  async officePdf(
    @Query() query: OfficeFilterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendPdf(
      res,
      await this.reports.officePdf(query.period, query.date, {
        wingId: query.wingId,
        designationId: query.designationId,
      }),
    );
  }
}
