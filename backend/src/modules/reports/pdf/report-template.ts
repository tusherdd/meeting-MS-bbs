/**
 * Self-contained HTML for report PDFs (rendered by PdfService). Rules:
 * - every value from the database is HTML-escaped (escapeHtml) — no raw interpolation;
 * - fonts are embedded as base64 data: URLs from backend/assets/fonts (Nikosh for Bangla, Tinos
 *   for English; owner decisions 2026-11-14), no internet fonts; numbers use Bangla digits;
 * - page size, margins and the footer "পৃষ্ঠা X / Y" come from CSS @page (margin boxes with
 *   Bangla counters), so no JavaScript is needed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

/** Bangla text (owner decision 2026-11-14). */
export const REPORT_FONT_FAMILY = 'Nikosh';
/**
 * English text: Tinos (SIL OFL 1.1), metric-compatible with Times New Roman, which is not
 * installed on the server and may not be bundled (licensed Microsoft font).
 */
export const REPORT_LATIN_FONT_FAMILY = 'Tinos';
/** The same split as the web pages: only Bangla characters come from Nikosh. */
export const BANGLA_UNICODE_RANGE = 'U+0980-09FF,U+0964-0965,U+200C-200D';

/**
 * Folder of the bundled font files, seen from this file:
 * - production build: dist/assets/fonts (copied by nest-cli.json "assets");
 * - development, tests and a build without the copy: backend/assets/fonts.
 */
export function reportFontPath(file = 'Nikosh.ttf'): string {
  const candidates = [
    join(__dirname, '..', '..', '..', 'assets', 'fonts', file),
    join(__dirname, '..', '..', '..', '..', 'assets', 'fonts', file),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      `Report font ${file} not found (looked in: ${candidates.join(', ')})`,
    );
  }
  return found;
}

let fontCss: string | undefined;

/**
 * @font-face rules with the font files inlined as data: URLs (read once; nothing is fetched).
 * - Nikosh: one weight, declared as 400 (Chrome synthesises bold), limited to Bangla characters
 *   and slightly enlarged (it draws smaller than Latin fonts at the same size).
 * - Tinos regular and bold: everything else (Latin letters, ASCII digits, punctuation, dashes).
 */
function embeddedFontCss(): string {
  if (fontCss) return fontCss;
  const data = (file: string) =>
    readFileSync(reportFontPath(file)).toString('base64');
  const face = (family: string, weight: number, file: string, extra = '') =>
    `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/ttf;base64,${data(file)}) format('truetype');${extra}}`;
  fontCss =
    face(
      REPORT_FONT_FAMILY,
      400,
      'Nikosh.ttf',
      `unicode-range:${BANGLA_UNICODE_RANGE};size-adjust:112%;`,
    ) +
    face(REPORT_LATIN_FONT_FAMILY, 400, 'Tinos-Regular.ttf') +
    face(REPORT_LATIN_FONT_FAMILY, 700, 'Tinos-Bold.ttf');
  return fontCss;
}

const e = (v: string | number | null | undefined) =>
  escapeHtml(v === null || v === undefined ? '—' : String(v));
const num = (v: number) => escapeHtml(toBanglaDigits(v));

/**
 * Digit rule (SPEC.md §13.11): only numbers the SYSTEM generates (counts, totals, dates, times,
 * page numbers) are shown in Bangla digits. Text typed by users (meeting title, room, names,
 * designation remarks, wing and designation names) is printed exactly as typed: "v2.1" stays
 * "v2.1".
 * - a `number` cell is system-generated → Bangla digits;
 * - `sys("2026-11-16")` marks system-generated text → Bangla digits;
 * - a plain `string` cell is user text → unchanged.
 */
export interface SystemText {
  readonly systemText: string;
}
export const sys = (text: string): SystemText => ({ systemText: text });
export type Cell = string | number | SystemText;

function cell(c: Cell): string {
  if (typeof c === 'number') return num(c);
  if (typeof c === 'string') return e(c);
  return e(toBanglaDigits(c.systemText));
}

export interface ReportHeader {
  /** e.g. "মোঃ ফিরোজ সরকার — সচিব" or the office filters. */
  subjectLines: Array<[label: string, value: string]>;
  periodLabelBn: string;
  generatedAtBn: string;
}

export interface SummaryRow {
  label: string;
  value: Cell;
}

export interface ExtraTable {
  title: string;
  headers: string[];
  rows: Cell[][];
}

function table(headers: string[], rows: Cell[][]): string {
  if (rows.length === 0) return '<p class="empty">কোনো তথ্য নেই।</p>';
  return `<table><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

export function statusRows(byStatus: StatusCounts): SummaryRow[] {
  return [
    { label: 'নির্ধারিত', value: byStatus.SCHEDULED },
    { label: 'সম্পন্ন', value: byStatus.COMPLETED },
    { label: 'বাতিল', value: byStatus.CANCELLED },
  ];
}

export function dayRows(days: DayCount[]): Cell[][] {
  // The date is system-generated ("2026-11-16") → Bangla digits.
  return days.map((d) => [sys(d.date), d.meetings, d.hours]);
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
  const meetingRows: Cell[][] = input.meetings.map((m) => [
    // System-generated time range (already Bangla); title, room and names are user text.
    sys(formatDhakaRange(m.startAt, m.endAt)),
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
    font-family: '${REPORT_FONT_FAMILY}', '${REPORT_LATIN_FONT_FAMILY}'; font-size: 10pt; color: #555;
  }
  @bottom-right {
    content: "${e(header.generatedAtBn)}";
    font-family: '${REPORT_FONT_FAMILY}', '${REPORT_LATIN_FONT_FAMILY}'; font-size: 9pt; color: #777;
  }
}
* { box-sizing: border-box; }
body { font-family: '${REPORT_FONT_FAMILY}', '${REPORT_LATIN_FONT_FAMILY}', serif; font-size: 11pt; color: #222; line-height: 1.5; margin: 0; }
header { border-bottom: 2px solid #006a4e; padding-bottom: 6px; margin-bottom: 10px; }
h1 { font-size: 17pt; color: #006a4e; margin: 0 0 4px; }
h2 { font-size: 13pt; margin: 14px 0 6px; color: #006a4e; }
.meta td { padding: 1px 10px 1px 0; border: none; }
table { width: 100%; border-collapse: collapse; margin-bottom: 6px; page-break-inside: auto; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #eef6f2; font-weight: 700; }
.summary td:last-child { text-align: right; font-weight: 700; width: 25%; }
.empty, .note { color: #666; font-size: 10pt; }
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
  ${input.summary.map((r) => `<tr><td>${e(r.label)}</td><td>${cell(r.value)}</td></tr>`).join('')}
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
