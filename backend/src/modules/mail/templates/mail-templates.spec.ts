import {
  DEFAULT_PASSWORD_HINT_BN,
  accountCreatedMail,
  adminResetNoticeMail,
  changeRequestDecisionMail,
  genericNotificationMail,
  maskEmail,
} from './mail-templates';
import { MAIL_FOOTER_BN, MAIL_HEADER_BN, renderMail } from './render';

describe('mail rendering', () => {
  it('uses one Bangla layout: BBS header and the "do not reply" footer, in HTML and text', () => {
    const mail = renderMail('বিষয়', 'রহিম', [
      { kind: 'paragraph', text: 'বার্তা' },
    ]);
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain(MAIL_HEADER_BN);
      expect(body).toContain(MAIL_FOOTER_BN);
      expect(body).toContain('প্রিয় রহিম,');
      expect(body).toContain('বার্তা');
    }
    expect(MAIL_FOOTER_BN).toBe('এটি স্বয়ংক্রিয় বার্তা, উত্তর দেবেন না।');
    expect(mail.html).toContain('lang="bn"');
  });

  it('HTML-escapes all user-provided text', () => {
    const evil = '<script>alert("x")</script> & <b>';
    const mail = changeRequestDecisionMail({
      nameBn: evil,
      approved: false,
      note: evil,
      typeLabel: 'পদবি',
      currentValue: evil,
      requestedValue: evil,
      link: 'http://localhost:3000/profile/change-requests',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain(evil); // never the raw string
    expect(mail.html).toContain(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;',
    );
    // the plain-text version is text, not HTML: shown as-is
    expect(mail.text).toContain(evil);
  });

  it('drops non-http(s) links (javascript:, data:)', () => {
    const mail = genericNotificationMail({
      nameBn: 'ক',
      title: 'শিরোনাম',
      body: 'বিবরণ',
      link: 'javascript:alert(1)',
    });
    expect(mail.html).not.toContain('javascript:');
    expect(mail.text).not.toContain('javascript:');
  });

  it('strips line breaks from subjects (no header injection)', () => {
    const mail = renderMail('Hi\r\nBcc: evil@x.test', null, []);
    expect(mail.subject).toBe('Hi Bcc: evil@x.test');
  });

  it.each([
    ['account created', accountCreatedMail],
    ['admin reset notice', adminResetNoticeMail],
  ])(
    '%s mail: login link + login email, the default-password hint, never the password',
    (_name, build) => {
      const secret = 'Default2026pass';
      const mail = build({
        nameBn: 'রহিম',
        loginEmail: 'rahim@bbs.gov.bd',
        loginUrl: 'http://localhost:3000/login',
      });
      expect(mail.html).toContain('href="http://localhost:3000/login"');
      expect(mail.text).toContain('rahim@bbs.gov.bd');
      expect(mail.text).toContain(DEFAULT_PASSWORD_HINT_BN);
      // The template has no way to receive the password, and no token link either.
      expect(mail.html + mail.text).not.toContain(secret);
      expect(mail.html + mail.text).not.toMatch(/token=/);
    },
  );

  it('masks emails', () => {
    expect(maskEmail('rahim.uddin@gmail.com')).toBe('ra***@gmail.com');
    expect(maskEmail('broken')).toBe('***');
  });
});
