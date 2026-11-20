import { OfficeReportScope } from '../../designations/enums/office-report-scope.enum';
import { MeetingStatus } from '../../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../../meetings/enums/participant-role.enum';
import type {
  OfficeMeetingRowDto,
  OfficeReportDto,
} from '../dto/office-report.dto';
import {
  OFFICE_REPORT_TITLE_BN,
  renderOfficeReportHtml,
  type OfficeReportPdfInput,
} from './office-report-template';

const row = (
  id: string,
  over: Partial<OfficeMeetingRowDto> = {},
): OfficeMeetingRowDto => ({
  id,
  title: `সভা ${id}`,
  // 10:30 Dhaka on 3 Nov 2026
  startAt: new Date('2026-11-03T04:30:00Z'),
  endAt: new Date('2026-11-03T05:30:00Z'),
  room: 'সম্মেলন কক্ষ',
  status: MeetingStatus.COMPLETED,
  organizerWingBn: 'কম্পিউটার উইং',
  organizerWingEn: 'Computer Wing',
  organizerDesignationBn: 'পরিচালক',
  organizerDesignationEn: 'Director',
  chairNameBn: 'জনাব করিম',
  chairNameEn: 'Karim',
  chairDesignationBn: 'মহাপরিচালক',
  chairDesignationEn: 'Director General',
  myRole: null,
  officerRole: null,
  decisionFileCount: 0,
  hasNotice: false,
  ...over,
});

function report(over: Partial<OfficeReportDto> = {}): OfficeReportDto {
  return {
    period: {
      period: 'month',
      date: '2026-11-01',
      labelBn: 'নভেম্বর ২০২৬',
      from: new Date('2026-10-31T18:00:00Z'),
      to: new Date('2026-11-30T18:00:00Z'),
    },
    scope: OfficeReportScope.OFFICE,
    wing: null,
    officer: null,
    cards: {
      total: 42,
      scheduled: 12,
      completed: 26,
      cancelled: 4,
      hours: 63.5,
    },
    wings: [
      {
        id: 'w1',
        nameBn: 'কম্পিউটার উইং',
        nameEn: null,
        meetings: 12,
        completed: 8,
        cancelled: 1,
        hours: 18,
      },
      {
        id: 'w2',
        nameBn: 'সেন্সাস উইং',
        nameEn: null,
        meetings: 8,
        completed: 5,
        cancelled: 1,
        hours: 12,
      },
    ],
    topParticipants: [
      {
        userId: 'u1',
        nameBn: 'জনাব কামরুল হাসান',
        nameEn: 'Kamrul',
        designationBn: 'মহাপরিচালক',
        designationEn: null,
        wingBn: 'কম্পিউটার উইং',
        wingEn: null,
        meetings: 18,
        hours: 27,
      },
    ],
    busiestDays: [{ date: '2026-11-23', meetings: 6, hours: 9 }],
    filterOptions: { organizerWings: [], chairs: [] },
    meetings: {
      items: [
        row('এক'),
        row('দুই', { status: MeetingStatus.CANCELLED, room: null }),
      ],
      total: 41,
      page: 2,
      limit: 20,
      totalPages: 3,
    },
    ...over,
  };
}

const input = (
  r: OfficeReportDto,
  extra: Partial<OfficeReportPdfInput> = {},
): OfficeReportPdfInput => ({
  officerBn: 'জনাব মহাপরিচালক সাহেব',
  designationBn: 'মহাপরিচালক মহোদয়',
  periodLabelBn: 'নভেম্বর ২০২৬',
  wingBn: 'সকল উইং',
  generatedAtBn: '২০ নভেম্বর ২০২৬, ১৯:৩০',
  report: r,
  ...extra,
});

describe('office report PDF template (v1.15)', () => {
  it('title, header lines, cards, wing list, top 5 and busiest days', () => {
    const html = renderOfficeReportHtml(input(report()));
    expect(OFFICE_REPORT_TITLE_BN).toBe(
      'বাংলাদেশ পরিসংখ্যান ব্যুরো — অফিস রিপোর্ট',
    );
    expect(html).toContain(`<h1 class="rt">${OFFICE_REPORT_TITLE_BN}</h1>`);
    for (const label of [
      'কর্মকর্তা',
      'পদবি',
      'সময়কাল',
      'উইং',
      'প্রস্তুতের সময়',
    ])
      expect(html).toContain(`<td>${label}</td><td class="c">:</td>`);
    expect(html).not.toContain('কর্মকর্তা ফিল্টার');
    expect(html).toContain('<td>সকল উইং</td>');
    // Cards in Bangla digits.
    expect(html).toContain('<div class="cv">৪২</div>');
    expect(html).toContain('<div class="cv">৬৩.৫</div>');
    expect(html).toContain('উইংভিত্তিক তালিকা');
    expect(html).toContain('সেন্সাস উইং');
    // "জনাব" never doubled; no "মহোদয়" inside the tables (only the header line).
    expect(html).toContain('জনাব কামরুল হাসান');
    expect(html).not.toContain('জনাব জনাব');
    expect(html.split('মহোদয়')).toHaveLength(2);
    expect(html).toContain(
      'আয়োজক, সভাপতি ও সদস্য — সব ভূমিকার সভা গোনা হয়েছে।',
    );
    expect(html).toContain('২৩ নভেম্বর ২০২৬');
    expect(html).toContain('size: A4 landscape');
    expect(html).toContain(
      'counter(page, bengali) "/" counter(pages, bengali)',
    );
  });

  it('the meeting list has EXACTLY the given (on-screen) rows', () => {
    const html = renderOfficeReportHtml(input(report()));
    const body = html.slice(html.indexOf('সভার তালিকা'));
    expect(body.match(/<tr><td>/g)).toHaveLength(2);
    expect(body).toContain('সভা এক');
    expect(body).toContain('সভা দুই');
    expect(body).toContain('০৩/১১/২০২৬');
    expect(body).toContain('১০:৩০');
    expect(body).toContain('স্থান উল্লেখ নেই');
    expect(body).toContain('বাতিল');
    // No role column without an officer; no buttons or the row menu glyph.
    expect(body).not.toContain('ভূমিকা');
    expect(html).not.toContain('⋮');
    expect(html).not.toContain('<button');
  });

  it('with an officer: the filter line, the ভূমিকা column; the wing list hidden (null)', () => {
    const r = report({
      wings: null,
      officer: {
        id: 'o',
        nameBn: 'নাসরিন আক্তার',
        nameEn: 'Nasrin',
        designationBn: 'পরিচালক',
        designationEn: null,
        wingBn: 'কম্পিউটার উইং',
        wingEn: null,
      },
      meetings: {
        items: [row('এক', { officerRole: ParticipantRole.CHAIR })],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    });
    const html = renderOfficeReportHtml(
      input(r, {
        officerFilterBn: 'জনাব নাসরিন আক্তার, পরিচালক · কম্পিউটার উইং',
      }),
    );
    expect(html).toContain('<td>কর্মকর্তা ফিল্টার</td>');
    expect(html).toContain('জনাব নাসরিন আক্তার, পরিচালক · কম্পিউটার উইং');
    expect(html).not.toContain('উইংভিত্তিক তালিকা');
    expect(html).toContain('<th>ভূমিকা</th>');
    expect(html).toContain('<td>সভাপতি</td>');
  });

  it('user text is escaped', () => {
    const r = report({
      meetings: {
        items: [row('<b>x</b>')],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    });
    const html = renderOfficeReportHtml(input(r));
    expect(html).toContain('সভা &lt;b&gt;x&lt;/b&gt;');
  });
});
