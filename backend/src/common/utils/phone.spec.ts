import { BD_MOBILE_PATTERN, normalizeBdMobile } from './phone';

describe('normalizeBdMobile', () => {
  it.each([
    ['01712345678', '01712345678'],
    ['০১৭১২৩৪৫৬৭৮', '01712345678'],
    ['০১৭১-২৩৪৫৬৭৮', '01712345678'],
    ['+8801712345678', '01712345678'],
    ['+880 1712-345678', '01712345678'],
    ['8801712345678', '01712345678'],
    ['008801712345678', '01712345678'],
    ['(017) 1234 5678', '01712345678'],
    ['+৮৮০১৯১২৩৪৫৬৭৮', '01912345678'],
  ])('%s → %s', (input, expected) => {
    const result = normalizeBdMobile(input);
    expect(result).toBe(expected);
    expect(BD_MOBILE_PATTERN.test(result)).toBe(true);
  });

  it.each([
    '0171234567',
    '017123456789',
    '01212345678',
    '02955007373',
    'abc',
    '',
  ])('"%s" is not a valid mobile after normalising', (input) => {
    expect(BD_MOBILE_PATTERN.test(normalizeBdMobile(input))).toBe(false);
  });
});
