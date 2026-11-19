import { DateTime } from 'luxon';
import { DHAKA_TZ } from '../../../common/utils/time';
import { MeetingStatus } from '../../meetings/enums/meeting-status.enum';
import type { ReportMeeting } from '../report-math';
import {
  MEASURE_ATTR,
  PAGE_CONTENT_HEIGHT_PX,
  renderScheduleHtml,
  type ScheduleHeader,
} from './report-template';
import { buildSchedulePdf, type PdfRenderer } from './schedule-pdf';
import {
  headerDesignationBn,
  scheduleTitleBn,
  toScheduleRows,
  withJanab,
} from './schedule-format';

const evil = '<img src=x onerror=alert(1)>';
const dhaka = (iso: string) =>
  DateTime.fromISO(iso, { zone: DHAKA_TZ }).toJSDate();

let seq = 0;
function meeting(over: Partial<ReportMeeting> = {}): ReportMeeting {
  const startAt = over.startAt ?? dhaka('2026-11-14T10:00');
  return {
    id: `m${++seq}`,
    title: 'সভা',
    startAt,
    endAt: new Date(startAt.getTime() + 3_600_000),
    room: 'বিবিএস সম্মেলন কক্ষ',
    status: MeetingStatus.SCHEDULED,
    organizerId: 'o',
    organizerNameBn: 'আয়োজক ব্যক্তি',
    organizerNameEn: 'EN_ONLY organizer',
    organizerDesignationId: 'd',
    organizerDesignationBn: 'উপপরিচালক',
    organizerDesignationEn: 'EN_ONLY designation',
    organizerDesignationPriority: 1,
    organizerWingId: 'w',
    organizerWingBn: 'কম্পিউটার উইং',
    organizerWingEn: 'EN_ONLY wing',
    myRole: null,
    chairNameBn: 'মোঃ কামরুল হাসান',
    chairNameEn: 'EN_ONLY chair',
    chairDesignationBn: 'মহাপরিচালক',
    guests: [],
    ...over,
  };
}

function header(over: Partial<ScheduleHeader> = {}): ScheduleHeader {
  return {
    titleBn: scheduleTitleBn('week'),
    officerBn: withJanab('মোঃ আরিফুল হক'),
    designationBn: headerDesignationBn('প্রোগ্রামার', 6),
    periodLabelBn: '১৫ নভেম্বর – ২১ নভেম্বর ২০২৬ (সপ্তাহ)',
    generatedAtBn: '১৯ নভেম্বর ২০২৬, ২২:১৫',
    ...over,
  };
}

/** Three meetings on the 14th, one on the 15th, one cancelled on the 14th. */
const week = () => [
  meeting({ title: 'A', startAt: dhaka('2026-11-14T10:00') }),
  meeting({ title: 'B', startAt: dhaka('2026-11-14T15:30') }),
  meeting({
    title: 'CANCELLED_ONE',
    status: MeetingStatus.CANCELLED,
    startAt: dhaka('2026-11-14T12:00'),
  }),
  meeting({ title: 'C', startAt: dhaka('2026-11-14T18:00') }),
  meeting({ title: 'D', startAt: dhaka('2026-11-15T12:00') }),
];

const count = (html: string, part: string) => html.split(part).length - 1;

describe('report PDF template "কর্মসূচি" (v1.14)', () => {
  it('A4 landscape, embedded NikoshBAN + Tinos, page numbers "১/২", nothing fetched', () => {
    const out = renderScheduleHtml({ header: header(), rows: [] });
    expect(out).toContain('<html lang="bn">');
    expect(out).toContain('size: A4 landscape;');
    expect(out).toContain(
      'content: counter(page, bengali) "/" counter(pages, bengali);',
    );
    expect(out).not.toContain('পৃষ্ঠা');
    expect(out).toContain("@font-face{font-family:'NikoshBAN';font-weight:400");
    expect(out).toContain('unicode-range:U+0980-09FF,U+0964-0965,U+200C-200D');
    expect(out).toContain("@font-face{font-family:'Tinos';font-weight:700");
    expect(out.match(/src:url\(data:font\/ttf;base64,/g)).toHaveLength(3);
    expect(out).not.toMatch(/https?:\/\//);
    expect(out).not.toContain('<img'); // no logo
  });

  it('header: green title, then label : value lines and a green rule; old title and Summary gone', () => {
    const out = renderScheduleHtml({ header: header(), rows: [] });
    expect(out).toContain(
      '<h1 class="rt">বাংলাদেশ পরিসংখ্যান ব্যুরো — সাপ্তাহিক কর্মসূচি</h1>',
    );
    expect(out).toContain(
      '<tr><td>কর্মকর্তা</td><td class="c">:</td><td>জনাব মোঃ আরিফুল হক</td></tr>',
    );
    expect(out).toContain(
      '<tr><td>পদবি</td><td class="c">:</td><td>প্রোগ্রামার</td></tr>',
    );
    expect(out).toContain(
      '<tr><td>সময়কাল</td><td class="c">:</td><td>১৫ নভেম্বর – ২১ নভেম্বর ২০২৬ (সপ্তাহ)</td></tr>',
    );
    expect(out).toContain(
      '<tr><td>প্রস্তুতের সময়</td><td class="c">:</td><td>১৯ নভেম্বর ২০২৬, ২২:১৫</td></tr>',
    );
    expect(out).toContain('<hr class="rule">');
    expect(out).toContain('#016B4F');
    expect(out).not.toContain('সভা প্রতিবেদন');
    expect(out).not.toContain('Summary');
  });

  it('empty state: the message and no table', () => {
    const out = renderScheduleHtml({
      header: header(),
      rows: toScheduleRows([meeting({ status: MeetingStatus.CANCELLED })]),
    });
    expect(out).toContain('<p class="empty">এই সময়ে কোনো সভা নেই।</p>');
    expect(out).not.toContain('<table class="sched');
  });

  it('one table with the six columns; cancelled meetings excluded', () => {
    const out = renderScheduleHtml({
      header: header(),
      rows: toScheduleRows(week()),
    });
    expect(count(out, '<table class="sched')).toBe(1);
    expect(out).toContain(
      '<th>তারিখ<br>ও দিন</th><th>সময়</th><th>বিষয়</th><th>সভাপতি/ প্রধান অতিথি</th><th>আয়োজক</th><th>স্থান</th>',
    );
    expect(out).not.toContain('CANCELLED_ONE');
    expect(count(out, '<td class="subject">')).toBe(4);
  });

  it('same date → one date cell with rowspan; the next date its own cell', () => {
    const out = renderScheduleHtml({
      header: header(),
      rows: toScheduleRows(week()),
    });
    expect(out).toContain(
      '<tr><td class="date" rowspan="3">১৪/১১/২০২৬<br>শনিবার</td><td>সকাল<br>১০.০০</td><td class="subject">A</td>',
    );
    expect(out).toContain(
      '<tr><td>বিকাল<br>০৩.৩০</td><td class="subject">B</td>',
    );
    expect(out).toContain(
      '<tr><td>সন্ধ্যা<br>০৬.০০</td><td class="subject">C</td>',
    );
    expect(out).toContain(
      '<tr><td class="date">১৫/১১/২০২৬<br>রবিবার</td><td>দুপুর<br>১২.০০</td><td class="subject">D</td>',
    );
    expect(count(out, '১৪/১১/২০২৬')).toBe(1);
  });

  it('a date group crossing a page break repeats the date cell and the table header', () => {
    const out = renderScheduleHtml({
      header: header(),
      rows: toScheduleRows(week()),
      pages: [
        [0, 1],
        [2, 3],
      ],
    });
    expect(count(out, '<table class="sched')).toBe(2);
    expect(count(out, '<table class="sched next">')).toBe(1);
    expect(count(out, '<th>তারিখ<br>ও দিন</th>')).toBe(2);
    expect(count(out, '১৪/১১/২০২৬<br>শনিবার')).toBe(2);
    expect(out).toContain(
      '<td class="date" rowspan="2">১৪/১১/২০২৬<br>শনিবার</td>',
    );
    expect(out).toContain(
      '<td class="date">১৪/১১/২০২৬<br>শনিবার</td><td>সন্ধ্যা<br>০৬.০০</td>',
    );
    expect(out).toContain('break-before: page');
    expect(out).toContain('page-break-inside: avoid');
    expect(out).toContain('display: table-header-group');
  });

  it('chair cell: "জনাব" + name, designation on the next line; guest chair; no chair "—"; never "মহোদয়" in the table', () => {
    const out = renderScheduleHtml({
      header: header(),
      rows: toScheduleRows([
        meeting({
          chairNameBn: 'জনাব শামীম আহমেদ',
          chairDesignationBn: 'সচিব',
        }),
        meeting({
          startAt: dhaka('2026-11-14T11:00'),
          chairNameBn: 'Dr. Jane Guest',
          chairDesignationBn: 'Consultant, UNFPA',
        }),
        meeting({
          startAt: dhaka('2026-11-14T12:00'),
          chairNameBn: null,
          chairDesignationBn: null,
        }),
      ]),
    });
    expect(out).toContain('<td>জনাব শামীম আহমেদ<br>সচিব</td>');
    expect(out).not.toContain('জনাব জনাব');
    expect(out).toContain('<td>জনাব Dr. Jane Guest<br>Consultant, UNFPA</td>');
    expect(out).toContain('<td>—</td>');
    expect(out).not.toContain('মহোদয়');
  });

  it('"মহোদয়" only in the header, for priority 1–3', () => {
    const rows = toScheduleRows([meeting()]);
    const dg = renderScheduleHtml({
      header: header({ designationBn: headerDesignationBn('মহাপরিচালক', 2) }),
      rows,
    });
    expect(dg).toContain(
      '<td>পদবি</td><td class="c">:</td><td>মহাপরিচালক মহোদয়</td>',
    );
    expect(count(dg, 'মহোদয়')).toBe(1);
    expect(dg).toContain('<td>জনাব মোঃ কামরুল হাসান<br>মহাপরিচালক</td>');
    const director = renderScheduleHtml({
      header: header({ designationBn: headerDesignationBn('পরিচালক', 4) }),
      rows,
    });
    expect(director).not.toContain('মহোদয়');
  });

  it('organizer as the Bangla wing, venue or "স্থান উল্লেখ নেই"; user text as typed; Bangla only', () => {
    const out = renderScheduleHtml({
      header: header(),
      rows: toScheduleRows([
        meeting({
          title: 'SDG Tracker v2.1 (Room 501)',
          room: 'Conference Room 501',
        }),
        meeting({
          startAt: dhaka('2026-11-14T11:00'),
          room: null,
          organizerWingBn: null,
        }),
      ]),
    });
    expect(out).toContain(
      '<td class="subject">SDG Tracker v2.1 (Room 501)</td>',
    );
    expect(out).toContain('<td>Conference Room 501</td>');
    expect(out).toContain('<td>কম্পিউটার উইং</td>');
    expect(out).toContain('<td>উপপরিচালক</td>');
    expect(out).toContain('<td>স্থান উল্লেখ নেই</td>');
    expect(out).not.toContain('আয়োজক ব্যক্তি');
    expect(out).not.toContain('EN_ONLY');
  });

  it('HTML-escapes every value from the database', () => {
    const out = renderScheduleHtml({
      header: header({ officerBn: withJanab(evil), designationBn: evil }),
      rows: toScheduleRows([
        meeting({
          title: evil,
          room: '"><script>x</script>',
          chairNameBn: evil,
          chairDesignationBn: evil,
          organizerWingBn: evil,
        }),
      ]),
    });
    expect(out).not.toContain(evil);
    expect(out).not.toContain('<script>x</script>');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('measure mode: every row has its own date cell and the measure attribute', () => {
    const out = renderScheduleHtml({
      header: header(),
      rows: toScheduleRows(week()),
      mode: 'measure',
    });
    // header block + table header row + 4 rows
    expect(count(out, ` ${MEASURE_ATTR}>`)).toBe(6);
    expect(out).not.toContain('rowspan');
    expect(count(out, '১৪/১১/২০২৬<br>শনিবার')).toBe(3);
  });
});

describe('buildSchedulePdf (two passes)', () => {
  function fakeRenderer(heights: (rows: number) => number[]) {
    const rendered: string[] = [];
    const measured: string[] = [];
    const pdf: PdfRenderer = {
      measure: (html) => {
        measured.push(html);
        // minus the table header row, which carries the attribute too
        return Promise.resolve(
          heights(count(html, `<tr ${MEASURE_ATTR}>`) - 1),
        );
      },
      render: (html) => {
        rendered.push(html);
        return Promise.resolve(Buffer.from('%PDF-'));
      },
    };
    return { pdf, rendered, measured };
  }

  it('splits rows into pages by the measured heights and repeats the date cell', async () => {
    const rowHeight = Math.floor(PAGE_CONTENT_HEIGHT_PX / 3);
    const { pdf, rendered, measured } = fakeRenderer((n) => [
      200,
      40,
      ...Array<number>(n).fill(rowHeight),
    ]);
    const out = await buildSchedulePdf(pdf, header(), toScheduleRows(week()));
    expect(out.toString()).toBe('%PDF-');
    expect(measured).toHaveLength(1);
    expect(rendered).toHaveLength(1);
    // page 1 fits 1 row (after the header block), later pages 2 rows each → 3 tables.
    expect(count(rendered[0], '<table class="sched')).toBe(3);
    expect(count(rendered[0], '১৪/১১/২০২৬<br>শনিবার')).toBe(2);
  });

  it('no meetings → no measuring, the empty message', async () => {
    const { pdf, rendered, measured } = fakeRenderer(() => []);
    await buildSchedulePdf(pdf, header(), []);
    expect(measured).toHaveLength(0);
    expect(rendered[0]).toContain('এই সময়ে কোনো সভা নেই।');
  });

  it('an unexpected measure result falls back to one table', async () => {
    const { pdf, rendered } = fakeRenderer(() => [1, 2]);
    await buildSchedulePdf(pdf, header(), toScheduleRows(week()));
    expect(count(rendered[0], '<table class="sched')).toBe(1);
  });
});
