/**
 * Uploaded meeting files — minutes "সভা কার্যবিবরণী" (v1.11, SPEC.md §6.9) and the meeting notice
 * "সভার নোটিশ" (v1.13, §6.8): type sniffing, image metadata stripping, safe names. Pure functions
 * (no disk access), unit-tested directly.
 *
 * - The type comes ONLY from the bytes ("magic bytes"); the client's file name and Content-Type
 *   are ignored. Allowed: PDF, DOCX (v1.13), JPEG, PNG. Legacy .doc (OLE) and everything else
 *   is refused.
 * - PDF: must start with "%PDF-" and end with an "%%EOF" marker (in the last 2 KB).
 * - DOCX: a ZIP with [Content_Types].xml and word/document.xml, no macros (docx.ts).
 * - JPEG / PNG: sharp must decode the image as that same format (stops polyglots), then it is
 *   re-encoded without metadata (EXIF, GPS, comments are dropped; orientation is applied first).
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { normalizeBangla } from '../../common/utils/bangla';
import { checkDocx, looksLikeZip } from './docx';

export type DecisionFileType = 'pdf' | 'docx' | 'jpeg' | 'png';

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const DECISION_MIME: Record<DecisionFileType, string> = {
  pdf: 'application/pdf',
  docx: DOCX_MIME,
  jpeg: 'image/jpeg',
  png: 'image/png',
};
const EXTENSION: Record<DecisionFileType, string> = {
  pdf: '.pdf',
  docx: '.docx',
  jpeg: '.jpg',
  png: '.png',
};

/** Only PDF and images may be shown inline; a DOCX is always downloaded (v1.13). */
export function mayOpenInline(mime: string): boolean {
  return (
    mime === 'application/pdf' || mime === 'image/jpeg' || mime === 'image/png'
  );
}

/** Rejects "decompression bombs" (tiny files that expand to huge images). */
export const MAX_IMAGE_PIXELS = 60_000_000;

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function detectDecisionType(buffer: Buffer): DecisionFileType | null {
  if (buffer.length >= 5 && buffer.toString('latin1', 0, 5) === '%PDF-')
    return 'pdf';
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
    return 'jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE))
    return 'png';
  // Only a ZIP can be a DOCX; checkDocx decides whether it really is one.
  if (looksLikeZip(buffer)) return 'docx';
  return null;
}

export class DecisionFileError extends Error {
  constructor(readonly reason: 'type' | 'unreadable' | 'macro') {
    super(reason);
  }
}

export interface ProcessedDecisionFile {
  type: DecisionFileType;
  mime: string;
  extension: string;
  content: Buffer;
  sha256: string;
}

function hasPdfEnd(buffer: Buffer): boolean {
  const tail = buffer.subarray(Math.max(0, buffer.length - 2048));
  return tail.includes('%%EOF', 0, 'latin1');
}

/** Validates the bytes and returns what is stored (images without metadata). */
export async function processDecisionFile(
  input: Buffer,
): Promise<ProcessedDecisionFile> {
  const type = detectDecisionType(input);
  if (!type) throw new DecisionFileError('type');

  let content: Buffer;
  if (type === 'pdf') {
    if (!hasPdfEnd(input)) throw new DecisionFileError('unreadable');
    content = input;
  } else if (type === 'docx') {
    const check = checkDocx(input);
    if (check === 'macro') throw new DecisionFileError('macro');
    if (check === 'notDocx') throw new DecisionFileError('type');
    if (check === 'broken') throw new DecisionFileError('unreadable');
    content = input;
  } else {
    const options = {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'error' as const,
    };
    let format: string | undefined;
    try {
      format = (await sharp(input, options).metadata()).format;
    } catch {
      throw new DecisionFileError('unreadable');
    }
    if (format !== type) throw new DecisionFileError('type');
    try {
      // sharp writes no metadata unless asked (withMetadata), so EXIF/GPS/ICC comments go.
      const image = sharp(input, options).rotate();
      content = await (
        type === 'jpeg' ? image.jpeg({ quality: 92 }) : image.png()
      ).toBuffer();
    } catch {
      throw new DecisionFileError('unreadable');
    }
  }
  return {
    type,
    mime: DECISION_MIME[type],
    extension: EXTENSION[type],
    content,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

/** Characters never kept in a file name: path separators, Windows-reserved, quotes. */
const UNSAFE = /[<>:"/\\|?*]/g;
// Control characters and bidi overrides (could disguise an extension). ZWJ / ZWNJ stay: Bangla needs them.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const MAX_STEM = 150;

/**
 * Multer (busboy) reads multipart file names as latin1; browsers send UTF-8. Re-decode when the
 * bytes form valid UTF-8 (a real latin1 name with é etc. stays as it is).
 */
export function decodeUploadName(name: string | undefined): string {
  if (!name) return '';
  const bytes = Buffer.from(name, 'latin1');
  const utf8 = bytes.toString('utf8');
  return Buffer.from(utf8, 'utf8').equals(bytes) && !utf8.includes('\ufffd')
    ? utf8
    : name;
}

function cleanName(name: string | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  return normalizeBangla(base)
    .replace(INVISIBLE, '')
    .replace(UNSAFE, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
}

/** The client's name made safe to show in a message (extension kept, max 150 characters). */
export function displayName(name: string | undefined): string {
  return Array.from(cleanName(name)).slice(0, MAX_STEM).join('') || 'decision';
}

/**
 * A safe stored display name: the last path segment, without control / reserved characters,
 * its extension replaced by the one of the DETECTED type, at most 150 characters before it.
 */
export function sanitizeFileName(
  name: string | undefined,
  extension: string,
): string {
  let stem = cleanName(name)
    .replace(/\.[^.]{1,10}$/, '')
    .trim();
  stem = Array.from(stem).slice(0, MAX_STEM).join('').trim();
  return `${stem || 'decision'}${extension}`;
}

/**
 * Content-Disposition with an ASCII fallback and the UTF-8 name (RFC 6266 / 5987), so Bangla
 * names survive and no header injection is possible.
 */
export function contentDisposition(name: string, inline: boolean): string {
  const ascii =
    name
      .replace(/[^A-Za-z0-9._ -]/g, '_')
      .replace(/_+/g, '_')
      .trim() || 'decision';
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
