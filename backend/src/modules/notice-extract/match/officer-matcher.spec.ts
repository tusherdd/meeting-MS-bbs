import type { NoticeExtraction } from '../notice-extract.types';
import { parseParticipantLine } from '../parse/notice-parser';
import { buildExtractResponse } from './notice-matching';
import {
  buildOfficerIndex,
  matchLine,
  nameTokens,
  type NamedRef,
  type OfficerRecord,
} from './officer-matcher';
import { levenshtein, similarity } from './similarity';

const ref = (id: string, nameBn: string, nameEn = id): NamedRef => ({
  id,
  nameBn,
  nameEn,
});

const DIRECTOR = ref('d-dir', 'পরিচালক', 'Director');
const DEPUTY = ref('d-dd', 'উপপরিচালক', 'Deputy Director');
const ANALYST = ref('d-sa', 'সিস্টেম এনালিস্ট', 'System Analyst');
const PD = ref('d-pd', 'প্রকল্প পরিচালক', 'Project Director');
const COMPUTER = ref('w-comp', 'কম্পিউটার উইং', 'Computer Wing');
const INDUSTRY = ref(
  'w-il',
  'ইন্ডাস্ট্রি অ্যান্ড লেবার উইং',
  'Industry and Labour Wing',
);
const CENSUS = ref(
  'w-ec',
  'অর্থনৈতিক শুমারি ২০২৩ প্রকল্প',
  'Economic Census 2023 Project',
);

const officer = (
  id: string,
  nameBn: string,
  designation: NamedRef,
  wing: NamedRef | null,
  charges: OfficerRecord['charges'] = [],
): OfficerRecord => ({
  id,
  nameBn,
  nameEn: `Officer ${id}`,
  designation,
  wing,
  charges,
});

/** Test data only (made-up names). The caller passes active officers without SUPER_ADMIN. */
const OFFICERS: OfficerRecord[] = [
  officer('rafiq', 'মোঃ রফিকুল ইসলাম', DIRECTOR, COMPUTER),
  officer('firoz', 'এইচ. এম. ফিরোজ আহমেদ', DIRECTOR, INDUSTRY),
  officer('nasrin', 'নাসরিন সুলতানা', ANALYST, COMPUTER),
  officer('karim', 'আব্দুল করিম', DEPUTY, COMPUTER, [
    { designation: PD, wing: CENSUS },
  ]),
  officer('rahim', 'আব্দুল রহিম', DEPUTY, INDUSTRY),
];
const INDEX = buildOfficerIndex(OFFICERS);

function match(text: string) {
  const p = parseParticipantLine(text);
  return matchLine(
    { text, hasName: p.name !== null, isGroup: p.isGroup },
    INDEX,
  );
}

describe('similarity', () => {
  it('Levenshtein on code points', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(similarity('', '')).toBe(1);
    expect(similarity('আব্দুলকরিম', 'আব্দুলকহিম')).toBeCloseTo(0.9);
  });
});

describe('name normalization (v1.21, SPEC.md §6.12)', () => {
  it('drops honorifics and every spelling of "মোঃ"', () => {
    const expected = ['রফিকুল', 'ইসলাম'];
    for (const text of [
      'জনাব মোঃ রফিকুল ইসলাম',
      'মো: রফিকুল ইসলাম',
      'মুঃ রফিকুল ইসলাম',
      'মোহাম্মদ রফিকুল ইসলাম',
      'ড. মুহাম্মদ রফিকুল  ইসলাম',
      'রফিকুল ইসলাম',
    ])
      expect(nameTokens(text)).toEqual(expected);
  });

  it('commas and dots become spaces', () => {
    expect(nameTokens('এইচ, এম, ফিরোজ আহমেদ')).toEqual(
      nameTokens('এইচ. এম. ফিরোজ আহমেদ'),
    );
  });
});

describe('matchLine', () => {
  it('sure: one clear best match, designation and wing confirmed', () => {
    const result = match(
      'জনাব রফিকুল ইসলাম, পরিচালক, কম্পিউটার উইং, বিবিএস, আগারগাঁও, ঢাকা',
    );
    expect(result).toMatchObject({
      status: 'sure',
      candidate: {
        officer: { id: 'rafiq' },
        nameScore: 1,
        designationMatch: true,
        wingMatch: true,
      },
    });
  });

  it('sure: "মোঃ" written in the notice but not in the officer list, or the other way round', () => {
    expect(match('জনাব মোঃ নাসরিন সুলতানা, সিস্টেম এনালিস্ট')).toMatchObject({
      status: 'sure',
      candidate: { officer: { id: 'nasrin' } },
    });
  });

  it('the comma name "এইচ, এম, ফিরোজ" matches against the whole line', () => {
    expect(
      match(
        'জনাব এইচ, এম, ফিরোজ আহমেদ, পরিচালক, ইন্ডাস্ট্রি অ্যান্ড লেবার উইং, বিবিএস, আগারগাঁও, ঢাকা',
      ),
    ).toMatchObject({
      status: 'sure',
      candidate: { officer: { id: 'firoz' } },
    });

    // Also when the officer list writes the initials together.
    const joined = buildOfficerIndex([
      officer('firoz2', 'এইচএম ফিরোজ আহমেদ', DIRECTOR, INDUSTRY),
    ]);
    const text =
      'জনাব এইচ, এম, ফিরোজ আহমেদ, পরিচালক, ইন্ডাস্ট্রি অ্যান্ড লেবার উইং';
    expect(
      matchLine({ text, hasName: true, isGroup: false }, joined),
    ).toMatchObject({
      status: 'sure',
      candidate: { officer: { id: 'firoz2' }, nameScore: 1 },
    });
  });

  it('maybe: an OCR misread that fits two officers equally well', () => {
    const result = match('জনাব আব্দুল কহিম, উপপরিচালক');
    expect(result.status).toBe('maybe');
    if (result.status !== 'maybe') return;
    expect(result.candidates.map((c) => c.officer.id).sort()).toEqual([
      'karim',
      'rahim',
    ]);
    expect(result.candidates.length).toBeLessThanOrEqual(3);
  });

  it('unmatched: nobody with a similar name', () => {
    expect(
      match('জনাব কামাল হোসেন, উপসচিব, পরিসংখ্যান ও তথ্য ব্যবস্থাপনা বিভাগ'),
    ).toEqual({ status: 'unmatched', reason: 'not-found' });
  });

  it('unmatched "group": "কর্মকর্তা (সকল), …"', () => {
    expect(
      match(
        'কর্মকর্তা (সকল), অর্থনৈতিক শুমারি ২০২৩ প্রকল্প, বিবিএস, আগারগাঁও, ঢাকা-১২০৭',
      ),
    ).toEqual({ status: 'unmatched', reason: 'group' });
  });

  it('a line without a name: designation + wing (incl. additional charges) when exactly one officer fits', () => {
    expect(
      match(
        'প্রকল্প পরিচালক, অর্থনৈতিক শুমারি ২০২৩ প্রকল্প, বিবিএস, আগারগাঁও, ঢাকা-১২০৭',
      ),
    ).toMatchObject({
      status: 'sure',
      candidate: { officer: { id: 'karim' }, designationMatch: true },
    });
    expect(match('পরিচালক, কম্পিউটার উইং')).toMatchObject({
      status: 'sure',
      candidate: { officer: { id: 'rafiq' } },
    });
  });

  it('a line without a name that fits several officers stays unmatched', () => {
    expect(match('পরিচালক, বিবিএস')).toEqual({
      status: 'unmatched',
      reason: 'ambiguous',
    });
    expect(match('উপসচিব, বিবিএস')).toEqual({
      status: 'unmatched',
      reason: 'not-found',
    });
  });

  it('"পরিচালক" inside "প্রকল্প পরিচালক" or "উপপরিচালক" is not the director designation', () => {
    // Only karim holds "প্রকল্প পরিচালক"; the directors rafiq / firoz must not make it ambiguous.
    expect(match('প্রকল্প পরিচালক, বিবিএস')).toMatchObject({
      status: 'sure',
      candidate: { officer: { id: 'karim' } },
    });
    expect(match('উপ পরিচালক, ইন্ডাস্ট্রি অ্যান্ড লেবার উইং')).toMatchObject({
      status: 'sure',
      candidate: { officer: { id: 'rahim' } },
    });
  });
});

describe('buildExtractResponse', () => {
  const extraction = (
    chairText: string | null,
    lines: string[],
  ): NoticeExtraction => ({
    method: 'OCR',
    fields: {
      title: 'সভা',
      date: null,
      startTime: null,
      endTime: null,
      venue: null,
      agenda: null,
    },
    chairText,
    participants: lines.map(parseParticipantLine),
    warnings: [],
  });

  it('sorts lines into sure / maybe / unmatched with the parsed parts for "add as guest"', () => {
    const res = buildExtractResponse(
      extraction(null, [
        'জনাব রফিকুল ইসলাম, পরিচালক, কম্পিউটার উইং',
        'জনাব আব্দুল কহিম, উপপরিচালক',
        'জনাব কামাল হোসেন, উপসচিব, পরিসংখ্যান ও তথ্য ব্যবস্থাপনা বিভাগ',
      ]),
      OFFICERS,
    );
    expect(
      res.participants.sure.map((s) => [s.line, s.match.officer.id]),
    ).toEqual([[1, 'rafiq']]);
    expect(res.participants.maybe.map((m) => m.line)).toEqual([2]);
    expect(res.participants.unmatched).toEqual([
      {
        line: 3,
        text: 'জনাব কামাল হোসেন, উপসচিব, পরিসংখ্যান ও তথ্য ব্যবস্থাপনা বিভাগ',
        name: 'কামাল হোসেন',
        designation: 'উপসচিব',
        wing: 'পরিসংখ্যান ও তথ্য ব্যবস্থাপনা বিভাগ',
        reason: 'not-found',
      },
    ]);
    expect(res.chair).toBeNull();
  });

  it('matches the chair; an unknown chair is unmatched (may become a guest chair)', () => {
    const sure = buildExtractResponse(
      extraction(
        'জনাব মোঃ রফিকুল ইসলাম, পরিচালক (যুগ্মসচিব), বাংলাদেশ পরিসংখ্যান ব্যুরো',
        [],
      ),
      OFFICERS,
    );
    expect(sure.chair).toMatchObject({
      status: 'sure',
      match: { officer: { id: 'rafiq' } },
    });
    const guest = buildExtractResponse(
      extraction('জনাব কামাল হোসেন, উপসচিব', []),
      OFFICERS,
    );
    expect(guest.chair).toMatchObject({
      status: 'unmatched',
      name: 'কামাল হোসেন',
      designation: 'উপসচিব',
      reason: 'not-found',
      match: null,
    });
  });

  it('keeps an officer listed twice once, with a warning', () => {
    const res = buildExtractResponse(
      extraction(null, [
        'জনাব রফিকুল ইসলাম, পরিচালক, কম্পিউটার উইং',
        'জনাব মোঃ রফিকুল ইসলাম, পরিচালক',
      ]),
      OFFICERS,
    );
    expect(res.participants.sure).toHaveLength(1);
    expect(res.warnings.map((w) => w.code)).toEqual(['DUPLICATE_OFFICER']);
  });

  it('never matches anybody when the officer list is empty', () => {
    const res = buildExtractResponse(
      extraction(null, ['জনাব রফিকুল ইসলাম, পরিচালক']),
      [],
    );
    expect(res.participants.unmatched).toHaveLength(1);
  });
});
