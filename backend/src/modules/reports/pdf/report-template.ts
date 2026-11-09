/**
 * Self-contained HTML for report PDFs (rendered by PdfService). Rules:
 * - every value from the database is HTML-escaped (escapeHtml) — no raw interpolation;
 * - the Bangla font is embedded (base64 data: URL from @fontsource/noto-sans-bengali), no
 *   internet fonts; numbers are shown with Bangla digits;
 * - page size, margins and the footer "পৃষ্ঠা X / Y" come from CSS @page (margin boxes with
 *   Bangla counters), so no JavaScript is needed.
 */
import { readFileSync } from 'node:fs';
import { escapeHtml } from '../../../common/utils/html';
import { toBanglaDigits } from '../../../common/utils/digits';
import { formatDhakaRange } from '../../meetings/meeting-format';
import type { DayCount, ReportMeeting, StatusCounts } from '../report-math';

export const REPORT_TITLE_BN = 'বাংলাদেশ পরিসংখ্যান ব্যুরো — সভা প্রতিবেদন';

const STATUS_BN: Record<string, string> = {
  SCHEDULED: 'নির্ধারিত',
  COMPLETED: 'সম্পন্ন',
  CANCELLED: 'বাতিল',
};
const ROLE_BN: Record<string, string> = {
  ORGANIZER: 'আয়োজক',
  CHAIR: 'সভাপতি',
  MEMBER: 'সদস্য',
};

let fontCss: string | undefined;

/** @font-face rules with the font files inlined (read once). */
function embeddedFontCss(): string {
  if (fontCss) return fontCss;
  const face = (weight: 400 | 700) => {
    const file = require.resolve(
      `@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-${weight}-normal.woff2`,
    );
    const data = readFileSync(file).toString('base64');
    return `@font-face{font-family:'Noto Sans Bengali';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${data}) format('woff2');}`;
  };
  fontCss = face(400) + face(700);
  return fontCss;
}

const e = (v: string | number | null | undefined) =>
  escapeHtml(v === null || v === undefined ? '—' : String(v));
const num = (v: number) => escapeHtml(toBanglaDigits(v));

export interface ReportHeader {
  /** e.g. "মোঃ ফিরোজ সরকার — সচিব" or the office filters. */
  subjectLines: Array<[label: string, value: string]>;
  periodLabelBn: string;
  generatedAtBn: string;
}

export interface SummaryRow {
  label: string;
  value: number | string;
}

export interface ExtraTable {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}

function table(headers: string[], rows: Array<Array<string | number>>): string {
  if (rows.length === 0) return '<p class="empty">কোনো তথ্য নেই।</p>';
  return `<table><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${typeof c === 'number' ? num(c) : e(toBanglaDigits(c))}</td>`).join('')}</tr>`,
    )
    .join('')}</tbody></table>`;
}

export function statusRows(byStatus: StatusCounts): SummaryRow[] {
  return [
    { label: 'নির্ধারিত', value: byStatus.SCHEDULED },
    { label: 'সম্পন্ন', value: byStatus.COMPLETED },
    { label: 'বাতিল', value: byStatus.CANCELLED },
  ];
}

export function dayRows(days: DayCount[]): Array<Array<string | number>> {
  return days.map((d) => [d.date, d.meetings, d.hours]);
}

export function renderReportHtml(input: {
  header: ReportHeader;
  summary: SummaryRow[];
  extraTables: ExtraTable[];
  meetings: ReportMeeting[];
  showMyRole: boolean;
  /** Rows actually printed may be capped; total is still shown. */
  totalMeetings: number;
}): string {
  const { header } = input;
  const meetingRows = input.meetings.map((m) => [
    formatDhakaRange(m.startAt, m.endAt),
    m.title,
    m.room ?? '—',
    `${m.organizerNameBn}${m.organizerDesignationBn ? ` (${m.organizerDesignationBn})` : ''}`,
    ...(input.showMyRole ? [m.myRole ? ROLE_BN[m.myRole] : '—'] : []),
    STATUS_BN[m.status] ?? m.status,
  ]);
  const capped =
    input.meetings.length < input.totalMeetings
      ? `<p class="note">প্রথম ${num(input.meetings.length)}টি সভা দেখানো হয়েছে (মোট ${num(input.totalMeetings)}টি)।</p>`
      : '';

  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><title>${e(REPORT_TITLE_BN)}</title>
<style>
${embeddedFontCss()}
@page {
  size: A4;
  margin: 18mm 14mm 18mm 14mm;
  @bottom-center {
    content: "পৃষ্ঠা " counter(page, bengali) " / " counter(pages, bengali);
    font-family: 'Noto Sans Bengali'; font-size: 9pt; color: #555;
  }
  @bottom-right {
    content: "${e(header.generatedAtBn)}";
    font-family: 'Noto Sans Bengali'; font-size: 8pt; color: #777;
  }
}
* { box-sizing: border-box; }
body { font-family: 'Noto Sans Bengali', sans-serif; font-size: 10pt; color: #222; line-height: 1.5; margin: 0; }
header { border-bottom: 2px solid #006a4e; padding-bottom: 6px; margin-bottom: 10px; }
h1 { font-size: 15pt; color: #006a4e; margin: 0 0 4px; }
h2 { font-size: 11.5pt; margin: 14px 0 6px; color: #006a4e; }
.meta td { padding: 1px 10px 1px 0; border: none; }
table { width: 100%; border-collapse: collapse; margin-bottom: 6px; page-break-inside: auto; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #eef6f2; font-weight: 700; }
.summary td:last-child { text-align: right; font-weight: 700; width: 25%; }
.empty, .note { color: #666; font-size: 9pt; }
</style></head>
<body>
<header>
  <h1>${e(REPORT_TITLE_BN)}</h1>
  <table class="meta"><tbody>
    ${header.subjectLines.map(([l, v]) => `<tr><td>${e(l)}</td><td><b>${e(v)}</b></td></tr>`).join('')}
    <tr><td>সময়কাল</td><td><b>${e(header.periodLabelBn)}</b></td></tr>
    <tr><td>প্রস্তুতের সময়</td><td>${e(header.generatedAtBn)}</td></tr>
  </tbody></table>
</header>

<h2>সারসংক্ষেপ</h2>
<table class="summary"><tbody>
  ${input.summary.map((r) => `<tr><td>${e(r.label)}</td><td>${typeof r.value === 'number' ? num(r.value) : e(toBanglaDigits(r.value))}</td></tr>`).join('')}
</tbody></table>

${input.extraTables.map((t) => `<h2>${e(t.title)}</h2>${table(t.headers, t.rows)}`).join('\n')}

<h2>সভার তালিকা</h2>
${capped}
${table(
  [
    'সময়',
    'শিরোনাম',
    'স্থান',
    'আয়োজক',
    ...(input.showMyRole ? ['আমার ভূমিকা'] : []),
    'অবস্থা',
  ],
  meetingRows,
)}
</body></html>`;
}
