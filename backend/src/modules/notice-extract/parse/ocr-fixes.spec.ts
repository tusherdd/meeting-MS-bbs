import { BANGLA_NUKTA } from '../../../common/utils/bangla';
import { applyOcrFixes, OCR_FIXES } from './ocr-fixes';

describe('OCR-fix dictionary (v1.21, SPEC.md §6.12)', () => {
  it.each([
    ['বিবিএস, আগারগীও, ঢাকা', 'বিবিএস, আগারগাঁও, ঢাকা'],
    ['সচিব মহদয়', 'সচিব মহোদয়'],
    ['উপমহাপরিচালক (যেগাসচিব)', 'উপমহাপরিচালক (যুগ্মসচিব)'],
    ['সিস্টেম এনালিন্ট, কম্পিউটার উইং', 'সিস্টেম এনালিস্ট, কম্পিউটার উইং'],
  ])('%s → %s', (input, expected) => {
    expect(applyOcrFixes(input)).toBe(expected);
  });

  it('replaces whole words only', () => {
    // "মহদয়" inside a longer word is not touched.
    expect(applyOcrFixes('অমহদয়ক')).toBe('অমহদয়ক');
  });

  it('is idempotent and leaves correct text alone', () => {
    const text = 'উপমহাপরিচালক মহোদয়ের সভাকক্ষ, বিবিএস, আগারগাঁও, ঢাকা-১২০৭';
    expect(applyOcrFixes(text)).toBe(text);
    expect(applyOcrFixes(applyOcrFixes('আগারগীও'))).toBe('আগারগাঁও');
  });

  it('normalizes the nukta letters of the OCR output (SPEC.md §13.13)', () => {
    const { YYA, YA_NUKTA } = BANGLA_NUKTA;
    expect(applyOcrFixes(`মহো${'দ'}${YYA}`)).toBe(`মহো${'দ'}${YA_NUKTA}`);
  });

  it('has no entry that maps a word to itself', () => {
    for (const [from, to] of OCR_FIXES) expect(from).not.toBe(to);
  });
});
