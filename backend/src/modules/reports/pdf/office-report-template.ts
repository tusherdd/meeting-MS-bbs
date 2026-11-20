/**
 * v1.15 office report PDF "বাংলাদেশ পরিসংখ্যান ব্যুরো — অফিস রিপোর্ট" (SPEC.md §6.10). Always Bangla:
 * NikoshBAN for Bangla and Tinos for Latin (embedded, §13.10), Bangla digits for system numbers,
 * user text as typed (§13.11), A4 landscape, page numbers "১/২" in the footer.
 *
 * Body: the five cards, the FULL wing list (when the page shows it), top 5 participants and the
 * busiest 5 days side by side, then the meeting list with EXACTLY the rows on screen (same
 * filters, same page). No sidebar, buttons, filter controls or "⋮". "জনাব" before person names,
 * never "মহোদয়" in the tables.
 */
import { DateTime } from 'luxon';
import { toBanglaDigits } from '../../../common/utils/digits';
import { escapeHtml } from '../../../common/utils/html';
import { DHAKA_TZ } from '../../../common/utils/time';
import { OfficeReportScope } from '../../designations/enums/office-report-scope.enum';
import { MeetingStatus } from '../../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../../meetings/enums/participant-role.enum';
import type { OfficeReportDto } from '../dto/office-report.dto';
import {
  REPORT_FONT_FAMILY,
  REPORT_LATIN_FONT_FAMILY,
  embeddedFontCss,
} from './report-template';
import { NO_MEETINGS_BN, ORG_NAME_BN, withJanab } from './schedule-format';

export const OFFICE_REPORT_TITLE_BN = `${ORG_NAME_BN} — অফিস রিপোর্ট`;
export const PARTICIPANTS_NOTE_BN =
  'আয়োজক, সভাপতি ও সদস্য — সব ভূমিকার সভা গোনা হয়েছে।';
export const NO_VENUE_BN = 'স্থান উল্লেখ নেই';

const STATUS_BN: Record<MeetingStatus, string> = {
  [MeetingStatus.SCHEDULED]: 'চলমান',
  [MeetingStatus.COMPLETED]: 'সম্পন্ন',
  [MeetingStatus.CANCELLED]: 'বাতিল',
};
const ROLE_BN: Record<ParticipantRole, string> = {
  [ParticipantRole.ORGANIZER]: 'আয়োজক',
  [ParticipantRole.CHAIR]: 'সভাপতি',
  [ParticipantRole.MEMBER]: 'সদস্য',
};

export interface OfficeReportPdfInput {
  /** "জনাব <name>" of the downloading user. */
  officerBn: string;
  /** Their designation (+ " মহোদয়" for priority 1–3), "—" without one. */
  designationBn: string;
  periodLabelBn: string;
  /** The selected wing or "সকল উইং". */
  wingBn: string;
  /** Only when an officer is selected: "জনাব নাম, পদবি · উইং". */
  officerFilterBn?: string;
  generatedAtBn: string;
  report: OfficeReportDto;
}

const e = (v: string) => escapeHtml(v);
const n = (v: number) => toBanglaDigits(v);
/** Hours: at most 2 decimals, Bangla digits ("১২.৫"). */
const h = (v: number) => toBanglaDigits(String(Math.round(v * 100) / 100));
const dhaka = (d: Date) => DateTime.fromJSDate(d, { zone: DHAKA_TZ });

/** dd/mm/yyyy and HH:mm in Bangla digits, as on screen. */
export function rowDateBn(d: Date): string {
  return toBanglaDigits(dhaka(d).toFormat('dd/MM/yyyy'));
}
export function rowTimeBn(d: Date): string {
  return toBanglaDigits(dhaka(d).toFormat('HH:mm'));
}
function dayBn(date: string): string {
  return DateTime.fromISO(date, { zone: DHAKA_TZ })
    .setLocale('bn')
    .toFormat('d MMMM yyyy');
}

function section(title: string, body: string, cls = ''): string {
  return `<section class="block ${cls}"><h2>${e(title)}</h2>${body}</section>`;
}

function cardsHtml(r: OfficeReportDto): string {
  const c = r.cards;
  const card = (label: string, value: string) =>
    `<td><div class="cl">${e(label)}</div><div class="cv">${value}</div></td>`;
  return `<table class="cards"><tbody><tr>
${card('মোট সভা', n(c.total))}${card('চলমান', n(c.scheduled))}${card('সম্পন্ন', n(c.completed))}${card('বাতিল', n(c.cancelled))}${card('মোট ঘণ্টা', h(c.hours))}
</tr></tbody></table>`;
}

function wingsHtml(r: OfficeReportDto): string {
  if (!r.wings) return '';
  const rows = r.wings
    .map(
      (w) =>
        `<tr><td class="l">${e(w.nameBn)}</td><td>${n(w.meetings)}</td><td>${n(w.completed)}</td><td>${n(w.cancelled)}</td><td>${h(w.hours)}</td></tr>`,
    )
    .join('');
  return section(
    'উইংভিত্তিক তালিকা',
    `<table class="grid"><thead><tr><th class="l">উইং</th><th>মোট সভা</th><th>সম্পন্ন</th><th>বাতিল</th><th>মোট ঘণ্টা</th></tr></thead>
<tbody>${rows || `<tr><td colspan="5">${NO_MEETINGS_BN}</td></tr>`}</tbody></table>`,
  );
}

function sideBySideHtml(r: OfficeReportDto): string {
  const office = r.scope === OfficeReportScope.OFFICE;
  const people = r.topParticipants
    .map((p) => {
      const sub = [p.designationBn, office ? p.wingBn : null]
        .filter(Boolean)
        .join(', ');
      return `<tr><td class="l">${e(withJanab(p.nameBn))}${sub ? `<div class="sub">${e(sub)}</div>` : ''}</td><td>${n(p.meetings)}</td><td>${h(p.hours)}</td></tr>`;
    })
    .join('');
  const days = r.busiestDays
    .map(
      (d) =>
        `<tr><td class="l">${e(dayBn(d.date))}</td><td>${n(d.meetings)}</td><td>${h(d.hours)}</td></tr>`,
    )
    .join('');
  const empty = (cols: number) =>
    `<tr><td colspan="${cols}">${NO_MEETINGS_BN}</td></tr>`;
  return `<table class="two"><tbody><tr>
<td>${section(
    'শীর্ষ ৫ অংশগ্রহণকারী',
    `<table class="grid"><thead><tr><th class="l">নাম</th><th>সভা</th><th>ঘণ্টা</th></tr></thead><tbody>${people || empty(3)}</tbody></table>
<p class="note">${e(PARTICIPANTS_NOTE_BN)}</p>`,
  )}</td>
<td>${section(
    'সবচেয়ে ব্যস্ত ৫ দিন',
    `<table class="grid"><thead><tr><th class="l">তারিখ</th><th>সভা</th><th>ঘণ্টা</th></tr></thead><tbody>${days || empty(3)}</tbody></table>`,
  )}</td>
</tr></tbody></table>`;
}

function meetingsHtml(r: OfficeReportDto): string {
  const withRole = r.officer !== null;
  const head = [
    'তারিখ',
    'সময়',
    'বিষয়',
    'আয়োজক উইং',
    'সভাপতি',
    'স্থান',
    ...(withRole ? ['ভূমিকা'] : []),
    'অবস্থা',
  ];
  const rows = r.meetings.items
    .map((m) => {
      const cells = [
        rowDateBn(new Date(m.startAt)),
        rowTimeBn(new Date(m.startAt)),
        `<span class="subject">${e(m.title)}</span>`,
        e(m.organizerWingBn ?? m.organizerDesignationBn ?? '—'),
        e(m.chairDesignationBn ?? '—'),
        e(m.room?.trim() ? m.room : NO_VENUE_BN),
        ...(withRole ? [m.officerRole ? ROLE_BN[m.officerRole] : '—'] : []),
        STATUS_BN[m.status],
      ];
      return `<tr>${cells.map((c, i) => `<td${i === 2 ? ' class="l"' : ''}>${c}</td>`).join('')}</tr>`;
    })
    .join('');
  return `<section class="list"><h2>সভার তালিকা</h2>
<table class="grid meetings"><thead><tr>${head.map((t, i) => `<th${i === 2 ? ' class="l"' : ''}>${t}</th>`).join('')}</tr></thead>
<tbody>${rows || `<tr><td colspan="${head.length}">${NO_MEETINGS_BN}</td></tr>`}</tbody></table></section>`;
}

export function renderOfficeReportHtml(input: OfficeReportPdfInput): string {
  const font = `'${REPORT_FONT_FAMILY}', '${REPORT_LATIN_FONT_FAMILY}', serif`;
  const kv = (label: string, value: string) =>
    `<tr><td>${e(label)}</td><td class="c">:</td><td>${e(value)}</td></tr>`;
  const r = input.report;

  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><title>${e(OFFICE_REPORT_TITLE_BN)}</title>
<style>
${embeddedFontCss()}
@page {
  size: A4 landscape;
  margin: 14mm 14mm 16mm 14mm;
  @bottom-center {
    content: counter(page, bengali) "/" counter(pages, bengali);
    font-family: ${font}; font-size: 10pt; color: #000;
  }
}
* { box-sizing: border-box; }
body { font-family: ${font}; font-size: 11pt; color: #000; margin: 0; }
h1.rt { color: #016B4F; font-size: 17pt; font-weight: 700; margin: 0 0 8px; text-align: center; }
h2 { font-size: 12.5pt; margin: 0 0 6px; }
table.kv { width: auto; border-collapse: collapse; margin: 0 auto 6px; }
table.kv td { border: none; text-align: left; padding: 2px 0; }
table.kv td:first-child { color: #333; text-align: right; padding-right: 6px; }
table.kv td.c { width: 14px; text-align: center; }
hr.rule { border: 0; border-top: 1.5px solid #016B4F; margin: 6px 0 12px; }
section, .block { break-inside: avoid; page-break-inside: avoid; margin: 0 0 12px; }
section.list { break-inside: auto; page-break-inside: auto; }
table.cards { width: 100%; border-collapse: separate; border-spacing: 6px 0; margin: 0 -6px 12px; break-inside: avoid; }
table.cards td { border: 1px solid #999; border-radius: 4px; padding: 6px 10px; width: 20%; vertical-align: top; }
.cl { color: #333; font-size: 10.5pt; }
.cv { font-size: 18pt; font-weight: 700; }
table.grid { width: 100%; border-collapse: collapse; }
table.grid th, table.grid td { border: 1px solid #000; padding: 4px 6px; text-align: center; vertical-align: middle; line-height: 1.4; overflow-wrap: anywhere; }
table.grid th { background: #f2f2f2; font-weight: 700; }
table.grid .l { text-align: left; }
table.grid thead { display: table-header-group; }
table.grid tr { break-inside: avoid; page-break-inside: avoid; }
.sub { font-size: 9.5pt; color: #333; }
p.note { font-size: 9.5pt; color: #333; margin: 4px 0 0; }
table.two { width: 100%; border-collapse: separate; border-spacing: 0; break-inside: avoid; }
table.two > tbody > tr > td { width: 50%; vertical-align: top; padding: 0; }
table.two > tbody > tr > td:first-child { padding-right: 8px; }
table.two > tbody > tr > td:last-child { padding-left: 8px; }
.subject { font-size: 11.5pt; }
</style></head>
<body>
<h1 class="rt">${e(OFFICE_REPORT_TITLE_BN)}</h1>
<table class="kv"><tbody>
  ${kv('কর্মকর্তা', input.officerBn)}
  ${kv('পদবি', input.designationBn)}
  ${kv('সময়কাল', input.periodLabelBn)}
  ${kv('উইং', input.wingBn)}
  ${input.officerFilterBn ? kv('কর্মকর্তা ফিল্টার', input.officerFilterBn) : ''}
  ${kv('প্রস্তুতের সময়', input.generatedAtBn)}
</tbody></table>
<hr class="rule">
${cardsHtml(r)}
${wingsHtml(r)}
${sideBySideHtml(r)}
${meetingsHtml(r)}
</body></html>`;
}
