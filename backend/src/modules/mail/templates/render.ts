/**
 * One Bangla mail layout for every mail (step 7). Templates describe the content as blocks of
 * RAW text; this renderer escapes everything itself, so a template cannot forget to escape
 * user-provided text. Produces HTML and a plain-text alternative.
 */
import { escapeHtml } from '../../../common/utils/html';

export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

export type MailBlock =
  | { kind: 'paragraph'; text: string }
  | {
      kind: 'table';
      rows: ReadonlyArray<readonly [label: string, value: string]>;
    }
  | { kind: 'button'; label: string; url: string }
  | { kind: 'note'; text: string };

export const MAIL_HEADER_BN = 'বাংলাদেশ পরিসংখ্যান ব্যুরো (BBS)';
export const MAIL_HEADER_SUB_BN = 'সভা সূচি ব্যবস্থাপনা';
export const MAIL_FOOTER_BN = 'এটি স্বয়ংক্রিয় বার্তা, উত্তর দেবেন না।';
/**
 * Mail clients only use fonts installed on the reader's device (no web fonts, no unicode-range).
 * Owner decisions 2026-11-14: English in Times New Roman, Bangla in Nikosh. Times New Roman comes
 * FIRST on purpose: it has no Bangla characters, so Bangla falls through to Nikosh (its two
 * common installed names) and then to other Bangla fonts, while English stays in Times. With
 * Nikosh first, English would be drawn with Nikosh's own Latin letters.
 */
export const MAIL_FONT_FAMILY =
  "'Times New Roman',Times,'Nikosh','NikoshBAN','SolaimanLipi','Kalpurush','Noto Sans Bengali','Vrinda',serif";

/** Only http(s) links become buttons; anything else (javascript:, data:, ...) is dropped. */
function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

/** Subjects are mail headers: no line breaks (header injection), bounded length. */
function cleanSubject(subject: string): string {
  return subject
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 300);
}

function blockHtml(block: MailBlock): string {
  switch (block.kind) {
    case 'paragraph':
      return `<p style="margin:0 0 14px">${escapeHtml(block.text)}</p>`;
    case 'note':
      return `<p style="margin:0 0 14px;color:#555;font-size:13px">${escapeHtml(block.text)}</p>`;
    case 'table':
      return `<table cellpadding="6" style="border-collapse:collapse;margin:0 0 14px">${block.rows
        .map(
          ([label, value]) =>
            `<tr><td style="color:#555">${escapeHtml(label)}</td><td><b>${escapeHtml(value)}</b></td></tr>`,
        )
        .join('')}</table>`;
    case 'button': {
      const url = safeUrl(block.url);
      if (!url) return '';
      return `<p style="margin:18px 0"><a href="${escapeHtml(url)}" style="background:#006a4e;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">${escapeHtml(block.label)}</a></p>
<p style="margin:0 0 14px;color:#555;font-size:12px">বাটন কাজ না করলে এই ঠিকানাটি ব্রাউজারে খুলুন: ${escapeHtml(url)}</p>`;
    }
  }
}

function blockText(block: MailBlock): string {
  switch (block.kind) {
    case 'paragraph':
    case 'note':
      return block.text;
    case 'table':
      return block.rows
        .map(([label, value]) => `${label}: ${value}`)
        .join('\n');
    case 'button': {
      const url = safeUrl(block.url);
      return url ? `${block.label}: ${url}` : '';
    }
  }
}

export function renderMail(
  subject: string,
  greetingName: string | null,
  blocks: MailBlock[],
): MailContent {
  const all: MailBlock[] = greetingName
    ? [{ kind: 'paragraph', text: `প্রিয় ${greetingName},` }, ...blocks]
    : blocks;

  const html = `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f4f4;font-family:${MAIL_FONT_FAMILY};line-height:1.7;color:#222">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:6px;overflow:hidden">
<tr><td style="background:#006a4e;color:#fff;padding:14px 20px">
<div style="font-size:17px;font-weight:bold">${MAIL_HEADER_BN}</div>
<div style="font-size:13px">${MAIL_HEADER_SUB_BN}</div></td></tr>
<tr><td style="padding:20px">
${all.map(blockHtml).filter(Boolean).join('\n')}
</td></tr>
<tr><td style="padding:12px 20px;background:#fafafa;color:#777;font-size:12px;border-top:1px solid #eee">${MAIL_FOOTER_BN}</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    `${MAIL_HEADER_BN} — ${MAIL_HEADER_SUB_BN}`,
    '',
    ...all.map(blockText).filter((t) => t !== ''),
    '',
    '--',
    MAIL_FOOTER_BN,
  ]
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n');

  return { subject: cleanSubject(subject), html, text };
}
