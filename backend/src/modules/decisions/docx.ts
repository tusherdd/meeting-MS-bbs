/**
 * DOCX check by the bytes (v1.13, SPEC.md §6.8 / §6.9). A DOCX is a ZIP archive that contains
 * `[Content_Types].xml` and `word/document.xml`, and whose main part is a Word document
 * (`…wordprocessingml.document.main+xml`). Macro-enabled files are refused: any `vbaProject.bin`
 * / `vbaData.xml` part, or a content type that is "macroEnabled" or a VBA project.
 *
 * Only the ZIP central directory is read, plus `[Content_Types].xml` (inflated with a hard output
 * limit, so a "zip bomb" cannot blow up memory). Nothing else in the archive is unpacked; the
 * file is stored as uploaded and always downloaded as an attachment (never opened inline).
 * Pure function, unit-tested in decision-file.spec.ts.
 */
import { inflateRawSync } from 'node:zlib';

export type DocxCheck = 'docx' | 'notDocx' | 'macro' | 'broken';

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIR = 0x06054b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;
/** More entries than any real Word file has; protects the loop. */
const MAX_ENTRIES = 5000;
/** [Content_Types].xml is a few KB; anything bigger is refused. */
const MAX_CONTENT_TYPES_BYTES = 1024 * 1024;

const CONTENT_TYPES = '[Content_Types].xml';
const MAIN_DOCUMENT = 'word/document.xml';
const DOCX_MAIN_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

/** "PK\x03\x04": the start of every ZIP (and so every DOCX). */
export function looksLikeZip(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.readUInt32LE(0) === LOCAL_HEADER;
}

function findEndOfCentralDir(buffer: Buffer): number {
  const lowest = Math.max(0, buffer.length - EOCD_MIN - MAX_COMMENT);
  for (let i = buffer.length - EOCD_MIN; i >= lowest; i--) {
    if (buffer.readUInt32LE(i) === END_OF_CENTRAL_DIR) return i;
  }
  return -1;
}

/** The central directory entries, or null when the archive is malformed (or ZIP64). */
function readEntries(buffer: Buffer): Entry[] | null {
  if (buffer.length < EOCD_MIN) return null;
  const eocd = findEndOfCentralDir(buffer);
  if (eocd < 0) return null;
  const count = buffer.readUInt16LE(eocd + 10);
  const size = buffer.readUInt32LE(eocd + 12);
  const offset = buffer.readUInt32LE(eocd + 16);
  // ZIP64 markers: a Word file under 10 MB never needs them.
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff)
    return null;
  if (count > MAX_ENTRIES || offset + size > eocd) return null;

  const entries: Entry[] = [];
  let p = offset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > eocd || buffer.readUInt32LE(p) !== CENTRAL_HEADER) return null;
    const nameLength = buffer.readUInt16LE(p + 28);
    const extraLength = buffer.readUInt16LE(p + 30);
    const commentLength = buffer.readUInt16LE(p + 32);
    const end = p + 46 + nameLength + extraLength + commentLength;
    if (end > eocd) return null;
    entries.push({
      method: buffer.readUInt16LE(p + 10),
      compressedSize: buffer.readUInt32LE(p + 20),
      uncompressedSize: buffer.readUInt32LE(p + 24),
      localOffset: buffer.readUInt32LE(p + 42),
      name: buffer.toString('utf8', p + 46, p + 46 + nameLength),
    });
    p = end;
  }
  return entries;
}

/** The bytes of one entry (stored or deflated), or null when unreadable / too big. */
function readEntry(buffer: Buffer, entry: Entry): Buffer | null {
  if (entry.uncompressedSize > MAX_CONTENT_TYPES_BYTES) return null;
  const p = entry.localOffset;
  if (p + 30 > buffer.length || buffer.readUInt32LE(p) !== LOCAL_HEADER)
    return null;
  const start =
    p + 30 + buffer.readUInt16LE(p + 26) + buffer.readUInt16LE(p + 28);
  const end = start + entry.compressedSize;
  if (end > buffer.length) return null;
  const data = buffer.subarray(start, end);
  try {
    if (entry.method === 0) return data;
    if (entry.method === 8)
      return inflateRawSync(data, { maxOutputLength: MAX_CONTENT_TYPES_BYTES });
  } catch {
    return null;
  }
  return null; // other compression methods are not used by Word
}

/**
 * Classifies a ZIP upload:
 * - `docx`: a Word document without macros;
 * - `macro`: a Word file with macros (DOCM, or a DOCX with a VBA project) — refused;
 * - `notDocx`: a valid ZIP that is not a Word document (e.g. XLSX, a plain ZIP) — refused;
 * - `broken`: not a readable ZIP.
 */
export function checkDocx(buffer: Buffer): DocxCheck {
  if (!looksLikeZip(buffer)) return 'notDocx';
  const entries = readEntries(buffer);
  if (!entries) return 'broken';

  const names = new Set(entries.map((e) => e.name));
  const lower = entries.map((e) => e.name.toLowerCase());
  if (
    lower.some((n) => n.endsWith('vbaproject.bin') || n.endsWith('vbadata.xml'))
  )
    return 'macro';
  if (!names.has(CONTENT_TYPES) || !names.has(MAIN_DOCUMENT)) return 'notDocx';

  const typesEntry = entries.find((e) => e.name === CONTENT_TYPES)!;
  const types = readEntry(buffer, typesEntry);
  if (!types) return 'broken';
  const xml = types.toString('utf8').toLowerCase();
  if (xml.includes('macroenabled') || xml.includes('vbaproject'))
    return 'macro';
  if (!xml.includes(DOCX_MAIN_TYPE)) return 'notDocx';
  return 'docx';
}
