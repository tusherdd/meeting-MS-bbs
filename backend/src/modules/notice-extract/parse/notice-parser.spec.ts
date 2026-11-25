import { isInitials, parseNotice, parseParticipantLine } from './notice-parser';

/**
 * OCR text of a real notice (v1.21), anonymized: names, memo number and phone are made up.
 * Keeps the real structure: header, memo, top-right date, title paragraph, labels, body,
 * signature block, distribution list, and the copy list "অনুলিপি" (must be ignored).
 */
const REAL_NOTICE = `গণপ্রজাতন্ত্রী বাংলাদেশ সরকার
পরিকল্পনা মন্ত্রণালয়
বাংলাদেশ পরিসংখ্যান ব্যুরো
কম্পিউটার উইং
নং-৫২.০১.০০০০.৯৯৯.০১.০০১.২৬-১২৩ তারিখ: ০৫ নভেম্বর ২০২৬
সভার নোটিশ
বাংলাদেশ পরিসংখ্যান ব্যুরো (বিবিএস) কর্তৃক বাস্তবায়নাধীন অর্থনৈতিক শুমারি ২০২৩ শীর্ষক প্রকল্পের ICT Support
Team এর একটি সভা নিম্নবর্ণিত সময় অনুযায়ী অনুষ্ঠিত হবে:
সভাপতি : জনাব মোঃ আবুল কাশেম, উপমহাপরিচালক (যুগ্মসচিব), বাংলাদেশ পরিসংখ্যান ব্যুরো
তারিখ ও সময় : ১০ নভেম্বর, ২০২৬; বেলা : ১২.০০ ঘটিকা
স্থান : উপমহাপরিচালক মহদয়ের সভাকক্ষ, বিবিএস, আগারগীও, ঢাকা-১২০৭
আলোচ্যসূচি : ক) World Bank Technical Team এর Anonymized Economic Census 2024
Micro Data Access চাহিদা সংক্রান্ত আলোচনা; এবং
খ) বিবিধ;
২। সভায় সংশ্লিষ্ট সকলকে যথাসময়ে উপস্থিত থাকার জন্য নির্দেশক্রমে অনুরোধ করা হলো।
(মোঃ করিম উদ্দিন)
সিনিয়র সিস্টেম এনালিস্ট
ফোন: ০২-০০০০০০০০
বিতরণ: সদয় কার্যার্থে (জ্যেষ্ঠতার ক্রমানুসারে নয়):-
১. প্রকল্প পরিচালক, অর্থনৈতিক শুমারি ২০২৩ প্রকল্প, বিবিএস, আগারগাঁও, ঢাকা-১২০৭ (বিশেষ আমন্ত্রণে)।
৩. জনাব রফিকুল ইসলাম, পরিচালক, কম্পিউটার উইং, বিবিএস, আগারগাঁও, ঢাকা।
৪. জনাব এইচ, এম, ফিরোজ আহমেদ, পরিচালক, ইন্ডাস্ট্রি অ্যান্ড লেবার উইং, বিবিএস, আগারগাঁও, ঢাকা (বিশেষ আমন্ত্রণে)।
৬. জনাব নাসরিন সুলতানা, সিস্টেম এনালিন্ট, কম্পিউটার উইং, বিবিএস, আগারগাঁও,
ঢাকা-১২০৭।
১৫. কর্মকর্তা (সকল), অর্থনৈতিক শুমারি ২০২৩ প্রকল্প, বিবিএস, আগারগাঁও, ঢাকা-১২০৭
অনুলিপি: সদয় জ্ঞাতার্থে/কার্যার্থে:
১. সচিব মহোদয়ের একান্ত সচিব, পরিসংখ্যান ও তথ্য ব্যবস্থাপনা বিভাগ
২. অফিস কপি।
`;

describe('parseNotice on the real notice (v1.21, SPEC.md §6.12)', () => {
  const parsed = parseNotice(REAL_NOTICE);

  it('reads the title without the BBS prefix and "একটি"', () => {
    expect(parsed.fields.title).toBe(
      'অর্থনৈতিক শুমারি ২০২৩ শীর্ষক প্রকল্পের ICT Support Team এর সভা',
    );
  });

  it('reads the meeting date (not the memo date at the top right) and the time', () => {
    expect(parsed.fields.date).toBe('2026-11-10');
    expect(parsed.fields.startTime).toBe('12:00');
    expect(parsed.fields.endTime).toBe('12:45');
  });

  it('reads the venue with the OCR fixes applied', () => {
    expect(parsed.fields.venue).toBe(
      'উপমহাপরিচালক মহোদয়ের সভাকক্ষ, বিবিএস, আগারগাঁও, ঢাকা-১২০৭',
    );
  });

  it('keeps the ক) খ) line breaks of the agenda and stops at "২।"', () => {
    expect(parsed.fields.agenda).toBe(
      'ক) World Bank Technical Team এর Anonymized Economic Census 2024 Micro Data Access ' +
        'চাহিদা সংক্রান্ত আলোচনা; এবং\nখ) বিবিধ',
    );
  });

  it('returns the raw chair text', () => {
    expect(parsed.chairText).toBe(
      'জনাব মোঃ আবুল কাশেম, উপমহাপরিচালক (যুগ্মসচিব), বাংলাদেশ পরিসংখ্যান ব্যুরো',
    );
  });

  it('reads the distribution list, nothing from the signature or "অনুলিপি"', () => {
    expect(parsed.participants.map((p) => p.text)).toEqual([
      'প্রকল্প পরিচালক, অর্থনৈতিক শুমারি ২০২৩ প্রকল্প, বিবিএস, আগারগাঁও, ঢাকা-১২০৭',
      'জনাব রফিকুল ইসলাম, পরিচালক, কম্পিউটার উইং, বিবিএস, আগারগাঁও, ঢাকা',
      'জনাব এইচ, এম, ফিরোজ আহমেদ, পরিচালক, ইন্ডাস্ট্রি অ্যান্ড লেবার উইং, বিবিএস, আগারগাঁও, ঢাকা',
      'জনাব নাসরিন সুলতানা, সিস্টেম এনালিস্ট, কম্পিউটার উইং, বিবিএস, আগারগাঁও, ঢাকা-১২০৭',
      'কর্মকর্তা (সকল), অর্থনৈতিক শুমারি ২০২৩ প্রকল্প, বিবিএস, আগারগাঁও, ঢাকা-১২০৭',
    ]);
  });

  it('splits each line into name / designation / wing', () => {
    expect(parsed.participants[0]).toMatchObject({
      name: null,
      designation: 'প্রকল্প পরিচালক',
      wing: 'অর্থনৈতিক শুমারি ২০২৩ প্রকল্প',
      isGroup: false,
    });
    expect(parsed.participants[2]).toMatchObject({
      name: 'এইচ, এম, ফিরোজ আহমেদ',
      designation: 'পরিচালক',
      wing: 'ইন্ডাস্ট্রি অ্যান্ড লেবার উইং',
    });
    expect(parsed.participants[4].isGroup).toBe(true);
  });

  it('has no warnings', () => {
    expect(parsed.warnings).toEqual([]);
  });
});

describe('parseNotice: missing parts are null with a warning (never guessed)', () => {
  it('an unrelated text', () => {
    const parsed = parseNotice('এটি একটি সাধারণ চিঠি।');
    expect(parsed.fields).toEqual({
      title: null,
      date: null,
      startTime: null,
      endTime: null,
      venue: null,
      agenda: null,
    });
    expect(parsed.chairText).toBeNull();
    expect(parsed.participants).toEqual([]);
    expect(parsed.warnings.map((w) => w.code)).toEqual([
      'TITLE_NOT_FOUND',
      'DATE_NOT_FOUND',
      'TIME_NOT_FOUND',
      'VENUE_NOT_FOUND',
      'AGENDA_NOT_FOUND',
      'CHAIR_NOT_FOUND',
      'DISTRIBUTION_NOT_FOUND',
    ]);
  });

  it('separate "তারিখ" and "সময়" lines, label variants with "ঃ" and spaces', () => {
    const parsed = parseNotice(
      [
        'সভার নোটিশ',
        'কম্পিউটার উইং এর একটি সভা অনুষ্ঠিত হবে।',
        'সভাপতি ঃ জনাব রফিকুল ইসলাম, পরিচালক',
        'তারিখ  :  ১২/১১/২০২৬',
        'সময় : বিকাল ৩.৩০ ঘটিকা',
        'স্থান: সভাকক্ষ',
      ].join('\n'),
    );
    expect(parsed.fields).toMatchObject({
      title: 'কম্পিউটার উইং এর সভা',
      date: '2026-11-12',
      startTime: '15:30',
      endTime: '16:15',
      venue: 'সভাকক্ষ',
    });
    expect(parsed.chairText).toBe('জনাব রফিকুল ইসলাম, পরিচালক');
  });
});

describe('parseParticipantLine', () => {
  it('initials written with commas stay in the name', () => {
    expect(isInitials('এইচ')).toBe(true);
    expect(isInitials('এ.কে')).toBe(true);
    expect(isInitials('আলী')).toBe(false);
    expect(
      parseParticipantLine('জনাব আলী, পরিচালক, কম্পিউটার উইং'),
    ).toMatchObject({
      name: 'আলী',
      designation: 'পরিচালক',
      wing: 'কম্পিউটার উইং',
    });
  });

  it('"ড." and "বেগম" mark a name; address parts are never the wing', () => {
    expect(
      parseParticipantLine('ড. নাসরিন সুলতানা, পরিচালক, বিবিএস, আগারগাঁও'),
    ).toMatchObject({
      name: 'নাসরিন সুলতানা',
      designation: 'পরিচালক',
      wing: null,
    });
    expect(parseParticipantLine('বেগম সালমা খাতুন, উপপরিচালক')).toMatchObject({
      name: 'সালমা খাতুন',
      designation: 'উপপরিচালক',
    });
  });
});
