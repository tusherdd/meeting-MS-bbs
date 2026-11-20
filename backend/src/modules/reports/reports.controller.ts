import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
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
import type { AppRequest, AuthUser } from '../../common/types/auth-user';
import { OfficeReportDto, OfficeReportQueryDto } from './dto/office-report.dto';
import {
  PersonalReportDto,
  ReportPeriodQueryDto,
  ReportQueryDto,
} from './dto/report.dto';
import { OfficeReportService } from './office-report.service';
import { ReportsService, type PdfFile } from './reports.service';

/** PDF rendering is expensive: a tighter per-IP limit. */
const PDF_THROTTLE = { default: { limit: 10, ttl: minutes(1) } };

const PDF_RESPONSE = {
  description: 'A4 landscape PDF (Bangla), downloaded as an attachment',
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
  constructor(
    private readonly reports: ReportsService,
    private readonly officeReport: OfficeReportService,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'My report: summary + meeting list for a period',
    description:
      'Meetings where I am organizer, chair or participant and that START in the period (Asia/Dhaka). ' +
      'Example: `?period=month&date=2026-12-01`, or a custom range (v1.15) `?from=2026-11-01&to=2026-12-15` ' +
      '(both days inclusive, at most 2 years; 400 when the end is before the start).',
  })
  @ApiOkResponse({ type: PersonalReportDto })
  me(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportQueryDto,
  ): Promise<PersonalReportDto> {
    return this.reports.personal(user, query, query);
  }

  @Throttle(PDF_THROTTLE)
  @Get('me/pdf')
  @ApiOperation({
    summary: 'My report as PDF ("কর্মসূচি", A4 landscape, Bangla)',
    description:
      'Schedule of my meetings in the period without cancelled ones: date, time, subject, chair, organizer (wing), venue.',
  })
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
    return sendPdf(res, await this.reports.personalPdf(user, query));
  }

  @Get('office')
  @ApiOperation({
    summary:
      'Office report "অফিস রিপোর্ট" (v1.15): admins, OFFICE and WING viewers',
    description:
      'Scope (SPEC.md §6.10): ADMIN / SUPER_ADMIN and OFFICE designations see the whole office; WING designations ' +
      'only their own wing (another wingId, organizerWingId or an officer of another wing → 403); NONE → 403. ' +
      'Cards, the wing list (by the organizer’s wing), top 5 participants (all roles), the busiest 5 days and the ' +
      'filtered, paginated meeting list. Period: `period`/`date` or `from`/`to`.',
  })
  @ApiOkResponse({ type: OfficeReportDto })
  @ApiForbiddenResponse({
    description:
      'No office report access, no wing (WING), or outside the scope',
  })
  office(
    @CurrentUser() user: AuthUser,
    @Query() query: OfficeReportQueryDto,
  ): Promise<OfficeReportDto> {
    return this.officeReport.report(user, query);
  }

  @Throttle(PDF_THROTTLE)
  @Get('office/pdf')
  @ApiOperation({
    summary: 'Office report as PDF (v1.15, always Bangla, A4 landscape)',
    description:
      'The same query as GET /reports/office (filters AND page): the PDF holds exactly the meeting rows shown ' +
      'on screen. Same scope rules; audited as OFFICE_REPORT_EXPORTED.',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse(PDF_RESPONSE)
  @ApiForbiddenResponse({
    description:
      'No office report access, no wing (WING), or outside the scope',
  })
  @ApiServiceUnavailableResponse({
    description: 'PDF rendering took longer than 30 s',
  })
  async officePdf(
    @CurrentUser() user: AuthUser,
    @Query() query: OfficeReportQueryDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendPdf(
      res,
      await this.officeReport.reportPdf(user, query, req.ip ?? null),
    );
  }
}
