import {
  changeRequestDecisionMail,
  genericNotificationMail,
  maskEmail,
  setPasswordMail,
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

  it('set-password mail has the link (HTML + text) and never a password', () => {
    const mail = setPasswordMail({
      nameBn: 'রহিম',
      loginEmail: 'rahim@bbs.gov.bd',
      link: 'http://localhost:3000/set-password?token=abc_DEF-123',
      validHours: 72,
    });
    expect(mail.html).toContain(
      'href="http://localhost:3000/set-password?token=abc_DEF-123"',
    );
    expect(mail.text).toContain(
      'http://localhost:3000/set-password?token=abc_DEF-123',
    );
    expect(mail.text).toContain('rahim@bbs.gov.bd');
    expect(mail.text).toContain('72 ঘণ্টা');
    expect(mail.html + mail.text).not.toMatch(
      /অস্থায়ী পাসওয়ার্ড|temporary password/i,
    );
  });

  it('masks emails', () => {
    expect(maskEmail('rahim.uddin@gmail.com')).toBe('ra***@gmail.com');
    expect(maskEmail('broken')).toBe('***');
  });
});
