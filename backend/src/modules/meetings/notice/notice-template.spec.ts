import { hasUnnormalizedBangla } from '../../../common/utils/bangla';
import {
  chairLine,
  designationLabel,
  distributionLines,
  noticeDateTime,
  noticeTime,
  renderNoticeHtml,
  type NoticeInput,
  type NoticeOfficer,
} from './notice-template';

const officer = (
  nameBn: string,
  priority: number | null,
  extra: Partial<NoticeOfficer> = {},
): NoticeOfficer => ({
  nameBn,
  designationBn: 'পরিচালক',
  designationRemark: null,
  wingBn: 'কম্পিউটার উইং',
  priority,
  ...extra,
});

const base = (over: Partial<NoticeInput> = {}): NoticeInput => ({
  title: 'Review v2.1 (Room 501)',
  agenda: 'ক) প্রথম বিষয়;\nখ) বিবিধ।',
  // 05:00 UTC = 11:00 in Dhaka
  startAt: new Date('2026-11-20T05:00:00Z'),
  room: 'সম্মেলন কক্ষ 501',
  onlineLink: null,
  chair: null,
  officers: [officer('ক কর্মকর্তা', 4)],
  guests: [],
  signer: {
    nameBn: 'রপ্তানিকারী কর্মকর্তা',
    designationBn: 'প্রোগ্রামার',
    designationRemark: null,
  },
  exportedAt: new Date('2026-11-17T06:00:00Z'),
  ...over,
});

describe('notice time format', () => {
  it.each([
    ['2026-11-20T05:00:00Z', 'বেলা: ১১.০০ ঘটিকা'], // 11:00
    ['2026-11-20T08:30:00Z', 'বেলা: ২.৩০ ঘটিকা'], // 14:30 → 12-hour
    ['2026-11-20T06:05:00Z', 'বেলা: ১২.০৫ ঘটিকা'], // 12:05 noon
    ['2026-11-19T18:15:00Z', 'বেলা: ১২.১৫ ঘটিকা'], // 00:15 midnight
  ])('%s → %s', (iso, expected) => {
    expect(noticeTime(new Date(iso))).toBe(expected);
  });

  it('date and time together, Asia/Dhaka, Bangla digits', () => {
    expect(noticeDateTime(new Date('2026-11-20T05:00:00Z'))).toBe(
      '২০ নভেম্বর, ২০২৬; বেলা: ১১.০০ ঘটিকা',
    );
  });
});

describe('chair row', () => {
  it('officer chair: Bangla name and designation (+ remark)', () => {
    expect(
      chairLine({
        chair: officer('মোঃ কামরুল হাসান', 3, {
          designationBn: 'উপমহাপরিচালক',
          designationRemark: 'যুগ্মসচিব',
        }),
        guests: [],
      }),
    ).toBe('জনাব মোঃ কামরুল হাসান, উপমহাপরিচালক (যুগ্মসচিব)');
  });

  it('guest chair: the guest name and designation as typed', () => {
    expect(
      chairLine({
        chair: null,
        guests: [
          { name: 'Guest One', designation: 'Consultant', isChair: false },
          { name: 'রাশেদা পারভীন', designation: 'কনসালট্যান্ট', isChair: true },
        ],
      }),
    ).toBe('জনাব রাশেদা পারভীন, কনসালট্যান্ট');
  });

  it('no chair: no row', () => {
    expect(chairLine({ chair: null, guests: [] })).toBeNull();
    const html = renderNoticeHtml(base());
    expect(html).not.toContain('সভাপতি');
  });
});

describe('distribution list', () => {
  it('sorts by priority (most senior first), ties by Bangla name, guests last', () => {
    const lines = distributionLines(
      [
        officer('গ কর্মকর্তা', 6, { designationBn: 'উপপরিচালক' }),
        officer('খ কর্মকর্তা', 4),
        officer('ক কর্মকর্তা', 4),
        officer('ঘ কর্মকর্তা', 2, {
          designationBn: 'মহাপরিচালক',
          wingBn: null,
        }),
      ],
      [{ name: 'অতিথি', designation: 'কনসালট্যান্ট', isChair: false }],
    );
    expect(lines).toEqual([
      'জনাব ঘ কর্মকর্তা, মহাপরিচালক, বিবিএস, আগারগাঁও, ঢাকা-১২০৭।',
      'জনাব ক কর্মকর্তা, পরিচালক, কম্পিউটার উইং, বিবিএস, আগারগাঁও, ঢাকা-১২০৭।',
      'জনাব খ কর্মকর্তা, পরিচালক, কম্পিউটার উইং, বিবিএস, আগারগাঁও, ঢাকা-১২০৭।',
      'জনাব গ কর্মকর্তা, উপপরিচালক, কম্পিউটার উইং, বিবিএস, আগারগাঁও, ঢাকা-১২০৭।',
      'জনাব অতিথি, কনসালট্যান্ট (অতিথি কর্মকর্তা)।',
    ]);
  });

  it('numbers the list with Bangla digits', () => {
    const html = renderNoticeHtml(
      base({ officers: [officer('ক', 1), officer('খ', 2)] }),
    );
    expect(html).toContain('<span class="n">১.</span>');
    expect(html).toContain('<span class="n">২.</span>');
  });
});

describe('designationLabel', () => {
  it('adds the remark in brackets', () => {
    expect(designationLabel('পরিচালক', 'ভারপ্রাপ্ত')).toBe(
      'পরিচালক (ভারপ্রাপ্ত)',
    );
    expect(designationLabel('পরিচালক', null)).toBe('পরিচালক');
    expect(designationLabel(null, null)).toBeNull();
  });
});

describe('renderNoticeHtml', () => {
  it('the signature uses the exporting user', () => {
    const html = renderNoticeHtml(base());
    expect(html).toContain('<div data-signer-name>রপ্তানিকারী কর্মকর্তা</div>');
    expect(html).toContain('<div data-signer-designation>প্রোগ্রামার</div>');
  });

  it('prints user text as typed (digits too) and escapes it', () => {
    const html = renderNoticeHtml(
      base({ title: 'Plan <b>v2</b> & "x"', onlineLink: 'https://x.test/a' }),
    );
    expect(html).toContain(
      '"Plan &lt;b&gt;v2&lt;/b&gt; &amp; &quot;x&quot;" শীর্ষক',
    );
    expect(html).toContain('সম্মেলন কক্ষ 501<br>https://x.test/a');
    expect(html).toContain('ক) প্রথম বিষয়;\nখ) বিবিধ।');
  });

  it('has the fixed header, export date (Bangla + Gregorian), heading and footer', () => {
    const html = renderNoticeHtml(base());
    expect(html).toContain('গণপ্রজাতন্ত্রী বাংলাদেশ সরকার');
    expect(html).toContain('www.bbs.gov.bd');
    expect(html).toContain(
      '<div>২ অগ্রহায়ণ, ১৪৩৩</div><div>১৭ নভেম্বর, ২০২৬</div>',
    );
    expect(html).toContain('<h1>সভার নোটিশ</h1>');
    expect(html).toContain(
      'counter(page, bengali) "/" counter(pages, bengali)',
    );
    expect(html).not.toContain('অনুলিপি');
    expect(html).not.toMatch(/<img/);
    expect(hasUnnormalizedBangla(html)).toBe(false);
  });

  it('shows "স্থান উল্লেখ নেই" for a meeting without a venue', () => {
    expect(renderNoticeHtml(base({ room: null }))).toContain(
      'স্থান উল্লেখ নেই',
    );
  });
});
