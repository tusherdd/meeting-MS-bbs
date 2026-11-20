import { ForbiddenException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import type { AuditService } from '../audit/audit.service';
import { OfficeReportScope as S } from '../designations/enums/office-report-scope.enum';
import type { OfficeScopeService } from '../office-scope/office-scope.service';
import { UserRole } from '../users/enums/user-role.enum';
import type { OfficeReportQueryDto } from './dto/office-report.dto';
import {
  OFFICE_REPORT_MESSAGES,
  OfficeReportService,
} from './office-report.service';
import type { PdfService } from './pdf/pdf.service';

/**
 * v1.15 server-side scope checks of the office report (SPEC.md §6.10): they run before any data is
 * loaded, for the JSON report and the PDF alike.
 */
describe('OfficeReportService scope checks', () => {
  const actor = { id: 'viewer', role: UserRole.OFFICER } as AuthUser;
  const own = {
    id: '11111111-1111-4111-8111-111111111111',
    nameBn: 'নিজ উইং',
    nameEn: 'Own',
  };
  const other = '22222222-2222-4222-8222-222222222222';
  const base = {
    period: 'month',
    page: 1,
    limit: 20,
    skip: 0,
  } as OfficeReportQueryDto;

  function service(scope: S, wing: typeof own | null, officerWingId = own.id) {
    const repos: Record<string, unknown> = {
      Wing: { findOneBy: jest.fn().mockResolvedValue(own) },
      User: {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 'o', wingId: officerWingId }),
      },
    };
    const dataSource = {
      getRepository: (entity: { name: string }) => repos[entity.name],
    } as unknown as DataSource;
    const officeScope = {
      access: jest.fn().mockResolvedValue({ scope, wing }),
    } as unknown as OfficeScopeService;
    const render = jest.fn();
    const log = jest.fn();
    const pdf = { render } as unknown as PdfService;
    const audit = { log } as unknown as AuditService;
    return {
      svc: new OfficeReportService(dataSource, officeScope, pdf, audit),
      render,
      log,
    };
  }

  it('NONE → 403 (JSON and PDF), nothing rendered or audited', async () => {
    const { svc, render, log } = service(S.NONE, own);
    await expect(svc.report(actor, base)).rejects.toThrow(
      new ForbiddenException(OFFICE_REPORT_MESSAGES.forbidden),
    );
    await expect(svc.reportPdf(actor, base, null)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(render).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('WING without a wing → 403 with the no-wing message', async () => {
    const { svc } = service(S.WING, null);
    await expect(svc.report(actor, base)).rejects.toThrow(
      OFFICE_REPORT_MESSAGES.noWing,
    );
  });

  it('WING cannot read another wing, another organizer wing or another wing’s officer', async () => {
    const { svc } = service(S.WING, own, other);
    for (const query of [
      { ...base, wingId: other },
      { ...base, organizerWingId: other },
      { ...base, officerId: '33333333-3333-4333-8333-333333333333' },
    ] as OfficeReportQueryDto[]) {
      await expect(svc.report(actor, query)).rejects.toThrow(
        OFFICE_REPORT_MESSAGES.outOfScope,
      );
      await expect(svc.reportPdf(actor, query, null)).rejects.toThrow(
        OFFICE_REPORT_MESSAGES.outOfScope,
      );
    }
  });
});
