/**
 * Single-meeting notice "সভার নোটিশ" (v1.10, SPEC.md §6.8): self-contained HTML rendered by the
 * shared PdfService. Layout follows docs/samples/meeting-notice-sample.html.
 *
 * - Always Bangla, whatever the UI language; NikoshBAN for Bangla and Tinos for Latin, embedded
 *   as data: URLs (no network); no logo.
 * - System numbers (dates, time, list numbers, page numbers) in Bangla digits; user text (title,
 *   agenda, venue, link, names, designations, wings, guest data) exactly as typed and HTML-escaped.
 */
import { DateTime } from 'luxon';
import {
  formatBanglaCalendarDate,
  formatGregorianDateBn,
} from '../../../common/utils/bangla-calendar';
import { toBanglaDigits } from '../../../common/utils/digits';
import { escapeHtml } from '../../../common/utils/html';
import { DHAKA_TZ } from '../../../common/utils/time';
import {
  embeddedFontCss,
  REPORT_FONT_FAMILY,
  REPORT_LATIN_FONT_FAMILY,
} from '../../reports/pdf/report-template';
import { NO_VENUE_BN } from '../meeting-format';

export const NOTICE_TITLE_BN = 'সভার নোটিশ';
export const OFFICE_ADDRESS_BN = 'বিবিএস, আগারগাঁও, ঢাকা-১২০৭';
export const GUEST_SUFFIX_BN = '(অতিথি কর্মকর্তা)';

/** An internal officer as printed on the notice (Bangla values). */
export interface NoticeOfficer {
  nameBn: string;
  designationBn: string | null;
  designationRemark: string | null;
  wingBn: string | null;
  /** Designation priority: lower number = more senior. null = sorted last. */
  priority: number | null;
}

export interface NoticeGuest {
  name: string;
  designation: string;
  isChair: boolean;
}

export interface NoticeInput {
  title: string;
  agenda: string | null;
  startAt: Date;
  room: string | null;
  onlineLink: string | null;
  /** The internal chair (null when the chair is a guest or there is none). */
  chair: NoticeOfficer | null;
  /** Every internal person of the meeting: organizer, chair and participants. */
  officers: NoticeOfficer[];
  guests: NoticeGuest[];
  /** The user who exports the notice: printed in the signature block. */
  signer: Pick<NoticeOfficer, 'nameBn' | 'designationBn' | 'designationRemark'>;
  /** Export time: the "তারিখ" on top (Asia/Dhaka). */
  exportedAt: Date;
}

/** "উপমহাপরিচালক (যুগ্মসচিব)": the designation, with the remark in brackets when there is one. */
export function designationLabel(
  designationBn: string | null | undefined,
  remark: string | null | undefined,
): string | null {
  const d = designationBn?.trim();
  const r = remark?.trim();
  if (!d) return r || null;
  return r ? `${d} (${r})` : d;
}

const joinParts = (parts: Array<string | null | undefined>) =>
  parts.filter((p): p is string => !!p && p.trim().length > 0).join(', ');

/**
 * The সভাপতি row: an internal chair → "জনাব name, designation"; else a guest chair →
 * "জনাব name, designation"; no chair → null (the row is left out).
 */
export function chairLine(
  input: Pick<NoticeInput, 'chair' | 'guests'>,
): string | null {
  if (input.chair) {
    return `জনাব ${joinParts([
      input.chair.nameBn,
      designationLabel(
        input.chair.designationBn,
        input.chair.designationRemark,
      ),
    ])}`;
  }
  const guest = input.guests.find((g) => g.isChair);
  return guest ? `জনাব ${joinParts([guest.name, guest.designation])}` : null;
}

/** "বেলা: ১১.০০ ঘটিকা": the start time in Asia/Dhaka, 12-hour clock, Bangla digits. */
export function noticeTime(date: Date): string {
  const dt = DateTime.fromJSDate(date, { zone: DHAKA_TZ });
  const hour12 = dt.hour % 12 === 0 ? 12 : dt.hour % 12;
  const minutes = String(dt.minute).padStart(2, '0');
  return `বেলা: ${toBanglaDigits(`${hour12}.${minutes}`)} ঘটিকা`;
}

/** "২০ নভেম্বর, ২০২৬; বেলা: ১১.০০ ঘটিকা" */
export function noticeDateTime(startAt: Date): string {
  return `${formatGregorianDateBn(startAt)}; ${noticeTime(startAt)}`;
}

/**
 * The বিতরণ list: every internal officer by designation priority (most senior first), ties by
 * Bangla name; then the guest officers (chair first, then by name).
 */
export function distributionLines(
  officers: readonly NoticeOfficer[],
  guests: readonly NoticeGuest[],
): string[] {
  const sorted = [...officers].sort(
    (a, b) =>
      (a.priority ?? Number.MAX_SAFE_INTEGER) -
        (b.priority ?? Number.MAX_SAFE_INTEGER) ||
      a.nameBn.localeCompare(b.nameBn, 'bn'),
  );
  const guestsSorted = [...guests].sort(
    (a, b) =>
      Number(b.isChair) - Number(a.isChair) ||
      a.name.localeCompare(b.name, 'bn'),
  );
  return [
    ...sorted.map(
      (o) =>
        `জনাব ${joinParts([
          o.nameBn,
          designationLabel(o.designationBn, o.designationRemark),
          o.wingBn,
          OFFICE_ADDRESS_BN,
        ])}।`,
    ),
    ...guestsSorted.map(
      (g) => `জনাব ${joinParts([g.name, g.designation])} ${GUEST_SUFFIX_BN}।`,
    ),
  ];
}

const e = (v: string) => escapeHtml(v);

export function renderNoticeHtml(input: NoticeInput): string {
  const chair = chairLine(input);
  const venue = input.room?.trim() ? input.room : NO_VENUE_BN;
  const venueHtml = input.onlineLink
    ? `${e(venue)}<br>${e(input.onlineLink)}`
    : e(venue);
  const rows: Array<[string, string]> = [
    ...(chair ? [['সভাপতি', e(chair)] as [string, string]] : []),
    ['তারিখ ও সময়', e(noticeDateTime(input.startAt))],
    ['স্থান', venueHtml],
    ...(input.agenda?.trim()
      ? [
          ['আলোচ্যসূচি', `<span class="pre">${e(input.agenda)}</span>`] as [
            string,
            string,
          ],
        ]
      : []),
  ];
  const signerDesignation = designationLabel(
    input.signer.designationBn,
    input.signer.designationRemark,
  );
  const lines = distributionLines(input.officers, input.guests);
  const font = `'${REPORT_FONT_FAMILY}', '${REPORT_LATIN_FONT_FAMILY}', serif`;

  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><title>${e(NOTICE_TITLE_BN)}</title>
<style>
${embeddedFontCss()}
@page {
  size: A4;
  margin: 18mm 20mm 20mm 22mm;
  @bottom-center {
    content: counter(page, bengali) "/" counter(pages, bengali);
    font-family: ${font}; font-size: 10pt; color: #000;
  }
}
* { box-sizing: border-box; }
body { font-family: ${font}; font-size: 12.5pt; line-height: 1.55; color: #000; margin: 0; }
.head p { margin: 0; text-align: center; }
.head .org { font-weight: 700; }
.head .web { text-decoration: underline; }
.date { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 10px; }
.date .frac { text-align: center; }
.date .frac div:first-child { border-bottom: 1px solid #000; padding: 0 6px; }
.date .frac div:last-child { padding: 0 6px; }
h1 { font-size: 14pt; font-weight: 700; text-decoration: underline; text-align: center; margin: 10px 0 14px; }
p { margin: 0 0 8px; text-align: left; }
table.info { border-collapse: collapse; margin: 4px 0 12px 22px; }
table.info td { vertical-align: top; padding: 2px 0; }
table.info td.k { width: 110px; white-space: nowrap; padding-right: 8px; }
table.info td.c { width: 22px; text-align: center; }
.pre { white-space: pre-wrap; }
.sign { display: flex; justify-content: flex-end; margin-top: 10px; page-break-inside: avoid; }
.sign .box { text-align: center; min-width: 200px; }
.sign .space { height: 18mm; }
.dist { margin-top: 26px; }
.dist .title { font-weight: 700; }
ol { margin: 6px 0 0; padding-left: 0; list-style: none; }
ol li { display: flex; gap: 6px; margin-bottom: 2px; page-break-inside: avoid; }
ol li .n { min-width: 26px; }
</style></head>
<body>
<div class="head">
  <p>গণপ্রজাতন্ত্রী বাংলাদেশ সরকার</p>
  <p class="org">বাংলাদেশ পরিসংখ্যান ব্যুরো</p>
  <p>ই-২৭/এ, আগারগাঁও, ঢাকা-১২০৭</p>
  <p class="web">www.bbs.gov.bd</p>
</div>

<div class="date">
  <span>তারিখ :</span>
  <div class="frac"><div>${e(formatBanglaCalendarDate(input.exportedAt))}</div><div>${e(formatGregorianDateBn(input.exportedAt))}</div></div>
</div>

<h1>${e(NOTICE_TITLE_BN)}</h1>

<p>"${e(input.title)}" শীর্ষক একটি সভা নিম্নবর্ণিত সময় অনুযায়ী অনুষ্ঠিত হবে:</p>

<table class="info"><tbody>
${rows.map(([k, v]) => `  <tr><td class="k">${e(k)}</td><td class="c">:</td><td>${v}</td></tr>`).join('\n')}
</tbody></table>

<p>২। সভায় সংশ্লিষ্ট সকলকে যথাসময়ে উপস্থিত থাকার জন্য নির্দেশক্রমে অনুরোধ করা হলো।</p>

<div class="sign"><div class="box">
  <div class="space"></div>
  <div data-signer-name>${e(input.signer.nameBn)}</div>
  ${signerDesignation ? `<div data-signer-designation>${e(signerDesignation)}</div>` : ''}
</div></div>

<div class="dist">
  <div class="title">বিতরণ: সদয় কার্যার্থে (জ্যেষ্ঠতার ক্রমানুসারে):</div>
  <ol>
${lines.map((l, i) => `    <li><span class="n">${e(toBanglaDigits(i + 1))}.</span><span>${e(l)}</span></li>`).join('\n')}
  </ol>
</div>
</body></html>`;
}
