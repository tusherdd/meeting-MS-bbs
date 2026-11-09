import { generateSecureToken, hashesEqual, sha256Hex } from './token';

describe('token utils', () => {
  it('generates 32 random bytes as base64url', () => {
    const token = generateSecureToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateSecureToken()).not.toBe(token);
  });

  it('hashes deterministically to 64 hex chars', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('compares hashes', () => {
    expect(hashesEqual(sha256Hex('a'), sha256Hex('a'))).toBe(true);
    expect(hashesEqual(sha256Hex('a'), sha256Hex('b'))).toBe(false);
    expect(hashesEqual(sha256Hex('a'), 'abcd')).toBe(false);
  });
});
