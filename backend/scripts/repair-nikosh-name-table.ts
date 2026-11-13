/**
 * Repairs the `name` table of the original Nikosh.ttf so browsers accept the file.
 *
 * Why: the original file (2008) stores the whole licence text (about 35 KB, twice) inside the
 * `name` table. The string offsets in that table are 16-bit, the data is larger than 65 535
 * bytes, so the last records point to the wrong place. Chrome and Firefox check every web font
 * (OpenType Sanitizer) and reject the file: "OTS parsing error: name". Without the repair
 * Nikosh only shows on computers that have it installed, and never in the PDF reports.
 *
 * What changes: ONLY the `name` table (metadata) and the checksums that depend on it. No glyph,
 * no layout table, no metric is touched. Names, version, copyright, designers and the licence
 * URL are kept; the full licence text moves to LICENSE-Nikosh.txt next to the font.
 * Licence of the font: CC BY-NC-ND 3.0, which allows modifications that are technically
 * necessary to use the work in another medium or format (owner decision 2026-11-14).
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only scripts/repair-nikosh-name-table.ts <original.ttf> <out.ttf> [more-out.ttf…]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface NameRecord {
  platformId: number;
  encodingId: number;
  languageId: number;
  nameId: number;
  text: string;
}

const LICENSE_URL = 'http://creativecommons.org/licenses/by-nc-nd/3.0/';
const LICENSE_NOTE =
  'This Font Software is licensed under the Creative Commons Attribution-NonCommercial-NoDerivs 3.0 ' +
  `license: ${LICENSE_URL} . The full licence text is distributed with this file as LICENSE-Nikosh.txt. ` +
  'Only the name table of the original file was rewritten (it was larger than the format allows); ' +
  'the glyphs are unchanged.';

/** nameIDs kept from the original (Macintosh records hold clean Latin-1 text for all of them). */
const KEEP = [0, 1, 2, 3, 4, 5, 6, 8, 9];
const NAME_LICENSE_DESCRIPTION = 13;
const NAME_LICENSE_URL = 14;

function tableDirectory(font: Buffer): Map<string, { offset: number; length: number }> {
  const tables = new Map<string, { offset: number; length: number }>();
  const count = font.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const at = 12 + 16 * i;
    tables.set(font.toString('latin1', at, at + 4), {
      offset: font.readUInt32BE(at + 8),
      length: font.readUInt32BE(at + 12),
    });
  }
  return tables;
}

/** The Macintosh (platform 1, Roman) records: their offsets are all inside the valid range. */
function readMacNames(name: Buffer): Map<number, string> {
  const count = name.readUInt16BE(2);
  const stringOffset = name.readUInt16BE(4);
  const names = new Map<number, string>();
  for (let i = 0; i < count; i++) {
    const at = 6 + 12 * i;
    if (name.readUInt16BE(at) !== 1) continue;
    const nameId = name.readUInt16BE(at + 6);
    const length = name.readUInt16BE(at + 8);
    const offset = stringOffset + name.readUInt16BE(at + 10);
    names.set(nameId, name.toString('latin1', offset, offset + length));
  }
  return names;
}

function utf16be(text: string): Buffer {
  const le = Buffer.from(text, 'utf16le');
  for (let i = 0; i + 1 < le.length; i += 2) {
    const low = le[i];
    le[i] = le[i + 1];
    le[i + 1] = low;
  }
  return le;
}

function buildNameTable(records: NameRecord[]): Buffer {
  // Required order: platform, encoding, language, name id.
  const sorted = [...records].sort(
    (a, b) =>
      a.platformId - b.platformId ||
      a.encodingId - b.encodingId ||
      a.languageId - b.languageId ||
      a.nameId - b.nameId,
  );
  const header = Buffer.alloc(6 + 12 * sorted.length);
  header.writeUInt16BE(0, 0); // format 0
  header.writeUInt16BE(sorted.length, 2);
  header.writeUInt16BE(header.length, 4);
  const strings: Buffer[] = [];
  let offset = 0;
  sorted.forEach((r, i) => {
    const data = r.platformId === 1 ? Buffer.from(r.text, 'latin1') : utf16be(r.text);
    const at = 6 + 12 * i;
    header.writeUInt16BE(r.platformId, at);
    header.writeUInt16BE(r.encodingId, at + 2);
    header.writeUInt16BE(r.languageId, at + 4);
    header.writeUInt16BE(r.nameId, at + 6);
    header.writeUInt16BE(data.length, at + 8);
    header.writeUInt16BE(offset, at + 10);
    strings.push(data);
    offset += data.length;
  });
  if (offset > 0xffff) throw new Error('name strings still too large');
  return Buffer.concat([header, ...strings]);
}

function checksum(data: Buffer): number {
  const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
  data.copy(padded);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

/** Writes the font again with the same tables (same order of tags), only `name` replaced. */
function rebuildFont(font: Buffer, newName: Buffer): Buffer {
  const directory = tableDirectory(font);
  const tags = [...directory.keys()].sort();
  const headerSize = 12 + 16 * tags.length;
  const header = Buffer.alloc(headerSize);
  font.copy(header, 0, 0, 12); // sfnt version, numTables, searchRange, entrySelector, rangeShift

  const parts: Buffer[] = [];
  let offset = headerSize;
  let headOffset = -1;
  tags.forEach((tag, i) => {
    const t = directory.get(tag)!;
    let data = tag === 'name' ? newName : Buffer.from(font.subarray(t.offset, t.offset + t.length));
    if (tag === 'head') {
      data = Buffer.from(data);
      data.writeUInt32BE(0, 8); // checkSumAdjustment is computed over the file with this field = 0
      headOffset = offset;
    }
    const at = 12 + 16 * i;
    header.write(tag, at, 4, 'latin1');
    header.writeUInt32BE(checksum(data), at + 4);
    header.writeUInt32BE(offset, at + 8);
    header.writeUInt32BE(data.length, at + 12);
    const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
    data.copy(padded);
    parts.push(padded);
    offset += padded.length;
  });

  const out = Buffer.concat([header, ...parts]);
  if (headOffset < 0) throw new Error('no head table');
  out.writeUInt32BE((0xb1b0afba - checksum(out)) >>> 0, headOffset + 8);
  return out;
}

function main(): void {
  const [input, ...outputs] = process.argv.slice(2);
  if (!input || outputs.length === 0) {
    throw new Error('Usage: repair-nikosh-name-table.ts <original.ttf> <out.ttf> [more-out.ttf…]');
  }
  const font = readFileSync(input);
  const nameEntry = tableDirectory(font).get('name');
  if (!nameEntry) throw new Error('no name table');
  const mac = readMacNames(font.subarray(nameEntry.offset, nameEntry.offset + nameEntry.length));
  if (mac.get(1) !== 'Nikosh') throw new Error(`not the Nikosh font: "${mac.get(1) ?? ''}"`);

  const texts = new Map<number, string>();
  for (const id of KEEP) {
    const text = mac.get(id)?.trim();
    if (text) texts.set(id, text);
  }
  texts.set(NAME_LICENSE_DESCRIPTION, LICENSE_NOTE);
  texts.set(NAME_LICENSE_URL, LICENSE_URL);

  const records: NameRecord[] = [];
  for (const [nameId, text] of texts) {
    records.push({ platformId: 1, encodingId: 0, languageId: 0, nameId, text });
    records.push({ platformId: 3, encodingId: 1, languageId: 0x409, nameId, text });
  }
  const repaired = rebuildFont(font, buildNameTable(records));
  const license = (mac.get(NAME_LICENSE_DESCRIPTION) ?? '').replace(/\r\n?/g, '\n').trim();
  const licenseFile =
    `Nikosh — licence of the font file in this folder\n` +
    `${(texts.get(0) ?? '').replace(/\r\n?/g, '\n')}\n\n` +
    `Note: only the name table of the original file was rewritten so that browsers accept it\n` +
    `(see backend/scripts/repair-nikosh-name-table.ts). The glyphs are unchanged.\n\n` +
    `----- Licence text as shipped inside the original font -----\n\n${license}\n`;

  for (const out of outputs) {
    writeFileSync(out, repaired);
    writeFileSync(join(dirname(out), 'LICENSE-Nikosh.txt'), licenseFile);
    console.log(`wrote ${out} (${repaired.length} bytes, original ${font.length})`);
  }
}

main();
