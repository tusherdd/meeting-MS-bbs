import { maskPhone, redact, REDACTED } from './redact';

describe('redact (audit snapshots)', () => {
  it('removes secrets at any depth', () => {
    expect(
      redact({
        passwordHash: '$argon2id$...',
        tokenHash: 'abc',
        nested: { newPassword: 'x', refresh_token: 'y', secretKey: 'z' },
        list: [{ authorization: 'Bearer t' }],
        role: 'ADMIN',
      }),
    ).toEqual({
      passwordHash: REDACTED,
      tokenHash: REDACTED,
      nested: {
        newPassword: REDACTED,
        refresh_token: REDACTED,
        secretKey: REDACTED,
      },
      list: [{ authorization: REDACTED }],
      role: 'ADMIN',
    });
  });

  it('masks phone fields and phone numbers inside text', () => {
    expect(
      redact({
        mobile: '01712345678',
        fax: '+880 2 55007375',
        note: 'ফোন করুন 01812345678 নম্বরে',
        title: 'সভা ২০২৬',
        priority: 6,
      }),
    ).toEqual({
      mobile: '***678',
      fax: '***375',
      note: 'ফোন করুন ***678 নম্বরে',
      title: 'সভা ২০২৬',
      priority: 6,
    });
  });

  it('keeps non-sensitive data and nulls unchanged', () => {
    expect(redact({ fields: ['mobile', 'nameEn'], before: null })).toEqual({
      fields: ['mobile', 'nameEn'],
      before: null,
    });
    expect(maskPhone('12')).toBe('***');
  });
});
