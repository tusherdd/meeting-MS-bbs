/**
 * Test fixtures (not a test suite, never built: the name ends in "spec.ts" but not ".spec.ts"):
 * tiny ZIP / DOCX / DOCM files built in memory, for the unit and e2e tests of v1.13.
 */
import { crc32, deflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  content: string | Buffer;
  /** Deflate the entry (Word does); default stored. */
  deflate?: boolean;
}

/** A minimal, valid ZIP archive. */
export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = Buffer.isBuffer(e.content)
      ? e.content
      : Buffer.from(e.content, 'utf8');
    const data = e.deflate ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name, 'utf8');
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(e.deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(e.deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const DOCX_MAIN =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const DOCM_MAIN = 'application/vnd.ms-word.document.macroEnabled.main+xml';

function contentTypes(main: string, extra = ''): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    `<Override PartName="/word/document.xml" ContentType="${main}"/>${extra}</Types>`
  );
}

const DOCUMENT =
  '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Notice</w:t></w:r></w:p></w:body></w:document>';

/** A valid DOCX (deflated like Word writes it). */
export function docx(): Buffer {
  return buildZip([
    {
      name: '[Content_Types].xml',
      content: contentTypes(DOCX_MAIN),
      deflate: true,
    },
    { name: 'word/document.xml', content: DOCUMENT, deflate: true },
  ]);
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A valid DOCX with one paragraph per line (v1.21: a notice in the fixed format). */
export function docxFromLines(lines: string[]): Buffer {
  const body = lines
    .map(
      (l) =>
        `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(l)}</w:t></w:r></w:p>`,
    )
    .join('');
  const document =
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}</w:body></w:document>`;
  return buildZip([
    {
      name: '[Content_Types].xml',
      content: contentTypes(DOCX_MAIN),
      deflate: true,
    },
    { name: 'word/document.xml', content: document, deflate: true },
  ]);
}

/** A macro-enabled Word file (DOCM: macroEnabled main type + vbaProject.bin). */
export function docm(): Buffer {
  return buildZip([
    {
      name: '[Content_Types].xml',
      content: contentTypes(
        DOCM_MAIN,
        '<Override PartName="/word/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/>',
      ),
      deflate: true,
    },
    { name: 'word/document.xml', content: DOCUMENT, deflate: true },
    {
      name: 'word/vbaProject.bin',
      content: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
    },
  ]);
}

/** A DOCX content type, but a VBA project hidden inside (renamed .docm). */
export function docxWithVba(): Buffer {
  return buildZip([
    { name: '[Content_Types].xml', content: contentTypes(DOCX_MAIN) },
    { name: 'word/document.xml', content: DOCUMENT },
    { name: 'word/vbaProject.bin', content: Buffer.from('vba') },
  ]);
}

/** A ZIP that is not a Word file (e.g. an XLSX or a plain archive). */
export function plainZip(): Buffer {
  return buildZip([{ name: 'readme.txt', content: 'hello' }]);
}

/** Legacy Word .doc: an OLE compound file (magic D0 CF 11 E0 A1 B1 1A E1). */
export function legacyDoc(): Buffer {
  return Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(504),
  ]);
}

/** A Windows program renamed to .docx ("MZ" header). */
export function renamedExe(): Buffer {
  return Buffer.concat([
    Buffer.from('MZ\x90\x00', 'latin1'),
    Buffer.alloc(128),
  ]);
}
