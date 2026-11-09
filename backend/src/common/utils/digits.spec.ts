import { toAsciiDigits, toBanglaDigits } from './digits';

describe('toAsciiDigits', () => {
  it('converts Bangla digits', () => {
    expect(toAsciiDigits('০১৭১২৩৪৫৬৭৮৯')).toBe('017123456789');
  });

  it('keeps other characters', () => {
    expect(toAsciiDigits('+৮৮০ 2-55০০')).toBe('+880 2-5500');
    expect(toAsciiDigits('রহিম')).toBe('রহিম');
  });

  it('converts back to Bangla digits', () => {
    expect(toBanglaDigits('2026-27, 3.5')).toBe('২০২৬-২৭, ৩.৫');
    expect(toBanglaDigits(105)).toBe('১০৫');
  });
});
