import { escapeHtml } from './html';

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });

  it('leaves Bangla text unchanged', () => {
    expect(escapeHtml('মোঃ রহিম')).toBe('মোঃ রহিম');
  });
});
