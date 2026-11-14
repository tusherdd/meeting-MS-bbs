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

  it('asks for Times New Roman (English) then Nikosh (Bangla), owner decisions 2026-11-14', () => {
    const { html } = renderMail('বিষয়', null, []);
    expect(html).toContain(
      "font-family:'Times New Roman',Times,'Nikosh','NikoshBAN','SolaimanLipi','Kalpurush','Noto Sans Bengali','Vrinda',serif",
    );
    expect(html).not.toMatch(/@font-face|url\(/); // mail clients get no web font
  });

  // SPEC.md §13.11: text typed by users is never converted to Bangla digits.
  it('keeps digits in user text (meeting title, room) exactly as typed', () => {
    const mail = genericNotificationMail({
      nameBn: 'রহিম',
      title: 'সভার আমন্ত্রণ: Review v2.1',
      body: 'সভা: Review v2.1\nকক্ষ: Conference Room 501\nসময়: ১ ডিসেম্বর ২০২৬, সকাল ১০:০০',
      link: null,
    });
    for (const part of [mail.subject, mail.html, mail.text]) {
      expect(part).toContain('Review v2.1');
      expect(part).not.toContain('v২.১');
    }
    expect(mail.html).toContain('Conference Room 501');
    expect(mail.text).toContain('Conference Room 501');
    expect(mail.html).toContain('১ ডিসেম্বর ২০২৬'); // the system-made date stays Bangla
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
