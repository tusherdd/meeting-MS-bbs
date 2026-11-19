/**
 * Writes a sample report PDF "কর্মসূচি" (v1.14) with FICTIONAL data, to compare the layout with
 * docs/samples/. No database, no login: the real template, pagination and PdfService.
 *
 *   npm run pdf:sample            → backend/tmp/report-samples/schedule-sample.pdf (git-ignored)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { DHAKA_TZ } from '../src/common/utils/time';
import { normalizeBangla } from '../src/common/utils/bangla';
import { MeetingStatus } from '../src/modules/meetings/enums/meeting-status.enum';
import type { ReportMeeting } from '../src/modules/reports/report-math';
import { resolvePeriod } from '../src/modules/reports/report-period';
import { PdfService } from '../src/modules/reports/pdf/pdf.service';
import { buildSchedulePdf } from '../src/modules/reports/pdf/schedule-pdf';
import {
  headerDesignationBn,
  scheduleTitleBn,
  toScheduleRows,
  withJanab,
} from '../src/modules/reports/pdf/schedule-format';

const at = (day: string, time: string) =>
  DateTime.fromISO(`${day}T${time}`, { zone: DHAKA_TZ }).toJSDate();

let n = 0;
function meeting(
  day: string,
  time: string,
  title: string,
  chair: [name: string, designation: string] | null,
  wing: string,
  room: string | null,
  status = MeetingStatus.SCHEDULED,
): ReportMeeting {
  n++;
  const startAt = at(day, time);
  return {
    id: `sample-${String(n).padStart(3, '0')}`,
    title: normalizeBangla(title),
    startAt,
    endAt: new Date(startAt.getTime() + 3_600_000),
    room: room && normalizeBangla(room),
    status,
    organizerId: 'o',
    organizerNameBn: 'নমুনা আয়োজক',
    organizerNameEn: 'Sample organizer',
    organizerDesignationId: null,
    organizerDesignationBn: 'উপপরিচালক',
    organizerDesignationEn: 'Deputy Director',
    organizerDesignationPriority: 6,
    organizerWingId: 'w',
    organizerWingBn: normalizeBangla(wing),
    organizerWingEn: 'Sample wing',
    myRole: null,
    chairNameBn: chair && normalizeBangla(chair[0]),
    chairNameEn: chair && chair[0],
    chairDesignationBn: chair && normalizeBangla(chair[1]),
    guests: [],
  };
}

// All names, titles and places below are invented.
const DG: [string, string] = ['মোঃ কামরুল হাসান', 'মহাপরিচালক'];
const meetings: ReportMeeting[] = [
  meeting(
    '2026-11-15',
    '10:00',
    'QGDP এবং DGDP প্রকল্পের স্টেকহোল্ডার কনসালটেশন সেমিনার',
    ['মোঃ রফিকুল ইসলাম', 'উপদেষ্টা, অর্থ ও পরিকল্পনা মন্ত্রণালয়'],
    'ন্যাশনাল অ্যাকাউন্টিং উইং',
    'বিবিএস সম্মেলন কক্ষ',
  ),
  meeting(
    '2026-11-15',
    '15:30',
    'ক্ষুদ্র নৃ-গোষ্ঠী জরিপ ২০২৫ প্রকল্পের জরিপ সংক্রান্ত সার্বিক বিষয়ে মতামত গ্রহণের নিমিত্ত সেমিনার',
    ['জনাব শামীম আহমেদ', 'প্রতিমন্ত্রী'],
    'সেনসাস উইং',
    'বিবিএস সম্মেলন কক্ষ',
  ),
  meeting(
    '2026-11-15',
    '18:30',
    'বাতিল হওয়া নমুনা সভা (PDF-এ দেখাবে না)',
    DG,
    'কম্পিউটার উইং',
    'কক্ষ ১০১',
    MeetingStatus.CANCELLED,
  ),
  meeting(
    '2026-11-16',
    '10:00',
    "আন্তর্জাতিক অভিবাসন সংস্থার সহায়তায় বাস্তবায়নাধীন 'Drafting Migration Data Policy' শীর্ষক কার্যক্রমের টেকনিক্যাল কমিটি'র সভা",
    DG,
    'ডেমোগ্রাফি অ্যান্ড হেলথ উইং',
    'বিবিএস সম্মেলন কক্ষ',
  ),
  meeting(
    '2026-11-16',
    '12:00',
    'Bangladesh Gender and Environment Survey (BGES) জরিপ কার্যক্রমের টেকনিক্যাল কমিটির ৭ম সভা',
    DG,
    'সোশ্যাল সিকিউরিটি উইং',
    'মহাপরিচালক মহোদয়ের সভাকক্ষ',
  ),
  meeting(
    '2026-11-17',
    '14:30',
    'বিবিএস এর সাথে গ্রামীণ ফোন লিমিটেড এর ICT & Digital Solution বিষয়ে কৌশলগত ব্রিফিং সেশন',
    DG,
    'কম্পিউটার উইং',
    'মহাপরিচালক মহোদয়ের সভাকক্ষ',
  ),
  // A long day: crosses the page break, so its date cell is repeated on page 2.
  ...[
    ['09:00', 'সাপ্তাহিক সমন্বয় সভা'],
    [
      '10:30',
      "KOICA প্রকল্পের Big Data Piloting এর বিষয়বস্তু নির্ধারণের PIC'র ৬ষ্ঠ সভা",
    ],
    ['11:59', 'তথ্য নিরাপত্তা বিষয়ক কর্মশালা (প্রথম পর্ব)'],
    ['12:00', 'তথ্য নিরাপত্তা বিষয়ক কর্মশালা (দ্বিতীয় পর্ব)'],
    ['14:59', 'বার্ষিক কর্মসম্পাদন চুক্তি (APA) পর্যালোচনা সভা'],
    ['15:00', 'জাতীয় শুদ্ধাচার কৌশল বাস্তবায়ন কমিটির সভা'],
    ['18:00', 'অনলাইন প্রশিক্ষণ: Statistical Data Dissemination v2.1'],
    ['20:00', 'আন্তর্জাতিক অংশীদারদের সাথে ভার্চুয়াল সভা'],
  ].map(([time, title], i) =>
    meeting(
      '2026-11-18',
      time,
      title,
      i === 2
        ? null
        : i === 5
          ? ['ড. নমুনা অতিথি', 'পরামর্শক, নমুনা সংস্থা']
          : DG,
      'কম্পিউটার উইং',
      i === 6 ? null : 'মহাপরিচালক মহোদয়ের সভাকক্ষ',
    ),
  ),
  meeting(
    '2026-11-19',
    '10:00',
    'মাসিক সমন্বয় সভা',
    ['মোঃ নমুনা সচিব', 'সচিব'],
    'প্রশাসন উইং',
    'সম্মেলন কক্ষ (কক্ষ নং ৫০১)',
  ),
];

async function main(): Promise<void> {
  const p = resolvePeriod('week', '2026-11-18');
  const header = {
    titleBn: scheduleTitleBn(p.period),
    officerBn: withJanab(normalizeBangla('মোঃ আরিফুল হক')),
    designationBn: headerDesignationBn('প্রোগ্রামার', 6),
    periodLabelBn: p.labelBn,
    generatedAtBn: DateTime.now()
      .setZone(DHAKA_TZ)
      .setLocale('bn')
      .toFormat('d MMMM yyyy, HH:mm'),
  };
  const pdf = new PdfService();
  try {
    const content = await buildSchedulePdf(
      pdf,
      header,
      toScheduleRows(meetings),
    );
    const dir = join(__dirname, '..', 'tmp', 'report-samples');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'schedule-sample.pdf');
    writeFileSync(file, content);
    console.log(`Sample PDF written: ${file}`);
  } finally {
    await pdf.onApplicationShutdown();
  }
}

void main();
