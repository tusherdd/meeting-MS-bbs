import { toAsciiDigits } from './digits';

describe('toAsciiDigits', () => {
  it('converts Bangla digits', () => {
    expect(toAsciiDigits('০১৭১২৩৪৫৬৭৮৯')).toBe('017123456789');
  });

  it('keeps other characters', () => {
    expect(toAsciiDigits('+৮৮০ 2-55০০')).toBe('+880 2-5500');
    expect(toAsciiDigits('রহিম')).toBe('রহিম');
  });
});
