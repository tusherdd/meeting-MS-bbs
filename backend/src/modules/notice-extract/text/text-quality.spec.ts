import { hasUsableBanglaText } from './text-quality';

describe('hasUsableBanglaText (v1.21, SPEC.md §6.12)', () => {
  const bangla =
    'সভার নোটিশ বাংলাদেশ পরিসংখ্যান ব্যুরো কর্তৃক বাস্তবায়নাধীন অর্থনৈতিক শুমারি শীর্ষক প্রকল্পের একটি সভা অনুষ্ঠিত হবে। সভাপতি তারিখ ও সময় স্থান';

  it('accepts a real Bangla text layer', () => {
    expect(hasUsableBanglaText(bangla)).toBe(true);
  });

  it('refuses an empty layer (image-only scan)', () => {
    expect(hasUsableBanglaText('')).toBe(false);
    expect(hasUsableBanglaText('   \n ')).toBe(false);
  });

  it('refuses Bijoy / SutonnyMJ text (Latin letters drawn as Bangla)', () => {
    const bijoy =
      'mfvi ‡bvwUk evsjv‡`k cwimsL¨vb ey¨‡iv KZ©„K ev¯Íevqbvaxb A_©‰bwZK ïgvwi '.repeat(
        4,
      );
    expect(hasUsableBanglaText(bijoy)).toBe(false);
  });

  it('refuses Bangla text without the word "সভা"', () => {
    expect(hasUsableBanglaText(bangla.replace(/সভা/g, 'চিঠি'))).toBe(false);
  });
});
