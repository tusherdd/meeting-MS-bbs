import {
  checkPasswordStrength,
  hashPassword,
  hashUnusablePassword,
  verifyPassword,
} from './password';

describe('checkPasswordStrength', () => {
  it('accepts letters + digits with at least 8 chars', () => {
    expect(checkPasswordStrength('abcd1234')).toEqual([]);
  });

  it.each([
    ['too short', 'ab12'],
    ['no digit', 'abcdefgh'],
    ['no letter', '12345678'],
    ['empty', ''],
  ])('rejects %s', (_label, password) => {
    expect(checkPasswordStrength(password).length).toBeGreaterThan(0);
  });

  it('rejects a password equal to the email (case-insensitive)', () => {
    expect(
      checkPasswordStrength('Admin1@bbs.gov.bd', 'admin1@bbs.gov.bd'),
    ).toHaveLength(1);
  });
});

describe('hashing', () => {
  it('produces a verifiable argon2id hash', async () => {
    const hash = await hashPassword('abcd1234');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPassword(hash, 'abcd1234')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong123')).resolves.toBe(false);
  });

  it('salts: same password gives different hashes', async () => {
    expect(await hashPassword('abcd1234')).not.toBe(
      await hashPassword('abcd1234'),
    );
  });

  it('unusable password is a real argon2id hash', async () => {
    expect((await hashUnusablePassword()).startsWith('$argon2id$')).toBe(true);
  });
});
