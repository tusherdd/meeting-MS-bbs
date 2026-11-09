import { lowercaseTransformer } from './lowercase.transformer';

describe('lowercaseTransformer', () => {
  it('trims and lowercases on write', () => {
    expect(lowercaseTransformer.to('  Admin@BBS.gov.BD ')).toBe(
      'admin@bbs.gov.bd',
    );
  });

  it('passes null and undefined through', () => {
    expect(lowercaseTransformer.to(null)).toBeNull();
    expect(lowercaseTransformer.to(undefined)).toBeUndefined();
  });

  it('returns stored values unchanged on read', () => {
    expect(lowercaseTransformer.from('admin@bbs.gov.bd')).toBe(
      'admin@bbs.gov.bd',
    );
  });
});
