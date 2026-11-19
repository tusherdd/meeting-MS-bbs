/**
 * Self-contained HTML for the report PDFs "কর্মসূচি" (v1.14, SPEC.md §6.6; layout of
 * docs/samples/report-schedule-sample.html). Rendered by PdfService. Rules:
 * - every value from the database is HTML-escaped (escapeHtml) — no raw interpolation;
 * - fonts are embedded as base64 data: URLs from backend/assets/fonts (NikoshBAN for Bangla, Tinos
 *   for English; owner decisions 2026-11-14 and 2026-11-15), no internet fonts;
 * - system numbers (dates, times, page numbers) in Bangla digits, user text exactly as typed;
 * - A4 landscape; page size, margins and the footer "১/২" come from CSS @page (margin box with
 *   Bangla counters), so no JavaScript is needed;
 * - rows never split; the table header repeats on every page and a date cell (rowspan) is
 *   repeated on a new page: the service measures the rows first (mode "measure") and then
 *   prints one table per page (`pages`, see paginateRows()).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml } from '../../../common/utils/html';
import { toBanglaDigits } from '../../../common/utils/digits';
import {
  groupByDate,
  NO_MEETINGS_BN,
  type ScheduleRow,
} from './schedule-format';

/** Bangla text (owner decisions 2026-11-14, NikoshBAN since 2026-11-15). */
export const REPORT_FONT_FAMILY = 'NikoshBAN';
/**
 * English text: Tinos (SIL OFL 1.1), metric-compatible with Times New Roman, which is not
 * installed on the server and may not be bundled (licensed Microsoft font).
 */
export const REPORT_LATIN_FONT_FAMILY = 'Tinos';
/** The same split as the web pages: only Bangla characters come from NikoshBAN
 * (so its Bangla-looking ASCII digits are never used). */
export const BANGLA_UNICODE_RANGE = 'U+0980-09FF,U+0964-0965,U+200C-200D';

/**
 * Folder of the bundled font files, seen from this file:
 * - production build: dist/assets/fonts (copied by nest-cli.json "assets");
 * - development, tests and a build without the copy: backend/assets/fonts.
 */
export function reportFontPath(file = 'NikoshBAN.ttf'): string {
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
 * - NikoshBAN: one weight, declared as 400 (Chrome synthesises bold), limited to Bangla characters
 *   and slightly enlarged (it draws smaller than Latin fonts at the same size).
 * - Tinos regular and bold: everything else (Latin letters, ASCII digits, punctuation, dashes).
 */
export function embeddedFontCss(): string {
  if (fontCss) return fontCss;
  const data = (file: string) =>
    readFileSync(reportFontPath(file)).toString('base64');
  const face = (family: string, weight: number, file: string, extra = '') =>
    `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/ttf;base64,${data(file)}) format('truetype');${extra}}`;
  fontCss =
    face(
      REPORT_FONT_FAMILY,
      400,
      'NikoshBAN.ttf',
      `unicode-range:${BANGLA_UNICODE_RANGE};size-adjust:112%;`,
    ) +
    face(REPORT_LATIN_FONT_FAMILY, 400, 'Tinos-Regular.ttf') +
    face(REPORT_LATIN_FONT_FAMILY, 700, 'Tinos-Bold.ttf');
  return fontCss;
}

const e = (v: string) => escapeHtml(v);

/** A4 landscape with the sample's margins (top, right, bottom, left in mm). */
const PAGE_MM = { width: 297, height: 210 };
const MARGIN_MM = { top: 14, right: 14, bottom: 16, left: 14 };
const MM_TO_PX = 96 / 25.4;

/** Printable area of one page in CSS px (used to measure and to split the rows into pages). */
export const PAGE_CONTENT_WIDTH_PX = Math.floor(
  (PAGE_MM.width - MARGIN_MM.left - MARGIN_MM.right) * MM_TO_PX,
);
/** A little less than the real height, so small differences in measuring never push a row over. */
export const PAGE_CONTENT_HEIGHT_PX = Math.floor(
  (PAGE_MM.height - MARGIN_MM.top - MARGIN_MM.bottom) * MM_TO_PX - 8,
);

/** Attribute on the elements whose height the measuring pass reads (in document order). */
export const MEASURE_ATTR = 'data-m';

export const TABLE_HEADERS_HTML = [
  'তারিখ<br>ও দিন',
  'সময়',
  'বিষয়',
  'সভাপতি/ প্রধান অতিথি',
  'আয়োজক',
  'স্থান',
];

export interface ScheduleHeader {
  /** "বাংলাদেশ পরিসংখ্যান ব্যুরো — সাপ্তাহিক কর্মসূচি" */
  titleBn: string;
  /** "জনাব <name>" of the downloading user. */
  officerBn: string;
  /** Designation of the downloading user (with " মহোদয়" for priority 1–3). */
  designationBn: string;
  periodLabelBn: string;
  generatedAtBn: string;
  /** Optional line under the header (e.g. rows were capped). */
  noteBn?: string;
}

export interface ScheduleInput {
  header: ScheduleHeader;
  rows: readonly ScheduleRow[];
  /**
   * "measure": one table, every row with its own date cell and the `data-m` attribute
   * (header block, table header row, then each row). Default "print".
   */
  mode?: 'measure' | 'print';
  /** Row indexes per page (from paginateRows). Without it all rows go into one table. */
  pages?: readonly (readonly number[])[];
}

function dateCell(row: ScheduleRow, rowspan: number): string {
  const span = rowspan > 1 ? ` rowspan="${rowspan}"` : '';
  return `<td class="date"${span}>${e(row.dateBn)}<br>${e(row.weekdayBn)}</td>`;
}

function rowCells(row: ScheduleRow): string {
  const chair = row.chair
    ? `${e(row.chair.nameBn)}${row.chair.designationBn ? `<br>${e(row.chair.designationBn)}` : ''}`
    : '—';
  return (
    `<td>${e(row.dayPartBn)}<br>${e(row.timeBn)}</td>` +
    `<td class="subject">${e(row.title)}</td>` +
    `<td>${chair}</td>` +
    `<td>${e(row.organizerBn)}</td>` +
    `<td>${e(row.venueBn)}</td>`
  );
}

function tableHtml(body: string, measure: boolean, nextPage: boolean): string {
  const m = measure ? ` ${MEASURE_ATTR}` : '';
  return (
    `<table class="sched${nextPage ? ' next' : ''}">` +
    '<colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"><col class="c6"></colgroup>' +
    `<thead><tr${m}>${TABLE_HEADERS_HTML.map((h) => `<th>${h}</th>`).join('')}</tr></thead>` +
    `<tbody>${body}</tbody></table>`
  );
}

/** Rows of one page: same-day rows share one date cell (rowspan), starting fresh on each page. */
function pageBody(rows: readonly ScheduleRow[]): string {
  return groupByDate(rows)
    .map((group) =>
      group
        .map(
          (row, i) =>
            `<tr>${i === 0 ? dateCell(row, group.length) : ''}${rowCells(row)}</tr>`,
        )
        .join(''),
    )
    .join('');
}

function tablesHtml(input: ScheduleInput): string {
  const { rows } = input;
  if (rows.length === 0) return `<p class="empty">${e(NO_MEETINGS_BN)}</p>`;
  if (input.mode === 'measure') {
    const body = rows
      .map(
        (row) => `<tr ${MEASURE_ATTR}>${dateCell(row, 1)}${rowCells(row)}</tr>`,
      )
      .join('');
    return tableHtml(body, true, false);
  }
  const pages = input.pages?.length ? input.pages : [rows.map((_, i) => i)];
  return pages
    .map((indexes, p) =>
      tableHtml(
        pageBody(indexes.map((i) => rows[i]).filter(Boolean)),
        false,
        p > 0,
      ),
    )
    .join('\n');
}

export function renderScheduleHtml(input: ScheduleInput): string {
  const { header } = input;
  const m = input.mode === 'measure' ? ` ${MEASURE_ATTR}` : '';
  const kv = (label: string, value: string) =>
    `<tr><td>${e(label)}</td><td class="c">:</td><td>${e(value)}</td></tr>`;
  const font = `'${REPORT_FONT_FAMILY}', '${REPORT_LATIN_FONT_FAMILY}', serif`;

  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><title>${e(header.titleBn)}</title>
<style>
${embeddedFontCss()}
@page {
  size: A4 landscape;
  margin: ${MARGIN_MM.top}mm ${MARGIN_MM.right}mm ${MARGIN_MM.bottom}mm ${MARGIN_MM.left}mm;
  @bottom-center {
    content: counter(page, bengali) "/" counter(pages, bengali);
    font-family: ${font}; font-size: 10pt; color: #000;
  }
}
* { box-sizing: border-box; }
body { font-family: ${font}; font-size: 12pt; color: #000; margin: 0; }
.top { display: flow-root; }
h1.rt { color: #016B4F; font-size: 17pt; font-weight: 700; margin: 0 0 8px; text-align: center; }
table.kv { width: auto; border-collapse: collapse; margin: 0 auto 6px; }
table.kv td { border: none; text-align: left; padding: 2px 0; }
table.kv td:first-child { width: 120px; color: #333; text-align: right; padding-right: 6px; }
table.kv td.c { width: 14px; text-align: center; }
hr.rule { border: 0; border-top: 1.5px solid #016B4F; margin: 6px 0 12px; }
p.note { text-align: center; font-size: 10pt; margin: 0 0 8px; }
p.empty { text-align: center; margin: 16px 0; }
table.sched { width: 100%; border-collapse: collapse; table-layout: fixed; }
table.sched.next { break-before: page; }
table.sched th, table.sched td { border: 1px solid #000; padding: 6px 8px; vertical-align: middle; text-align: center; line-height: 1.45; overflow-wrap: anywhere; }
table.sched th { font-weight: 700; background: #f2f2f2; }
table.sched thead { display: table-header-group; }
table.sched tr { break-inside: avoid; page-break-inside: avoid; }
table.sched td.subject { text-align: center; font-size: 12.5pt; }
col.c1 { width: 11%; } col.c2 { width: 8%; } col.c3 { width: 34%; } col.c4 { width: 18%; } col.c5 { width: 14%; } col.c6 { width: 15%; }
</style></head>
<body>
<div class="top"${m}>
  <h1 class="rt">${e(header.titleBn)}</h1>
  <table class="kv"><tbody>
    ${kv('কর্মকর্তা', header.officerBn)}
    ${kv('পদবি', header.designationBn)}
    ${kv('সময়কাল', header.periodLabelBn)}
    ${kv('প্রস্তুতের সময়', header.generatedAtBn)}
  </tbody></table>
  <hr class="rule">
  ${header.noteBn ? `<p class="note">${e(header.noteBn)}</p>` : ''}
</div>
${tablesHtml(input)}
</body></html>`;
}

/** "প্রথম ১০০০টি সভা দেখানো হয়েছে (মোট ১২০০টি)।" when the rows were capped. */
export function cappedNoteBn(shown: number, total: number): string {
  return `প্রথম ${toBanglaDigits(shown)}টি সভা দেখানো হয়েছে (মোট ${toBanglaDigits(total)}টি)।`;
}
