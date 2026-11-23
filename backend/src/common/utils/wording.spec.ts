import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Wording rules of v1.5 (SPEC.md §13.12, owner decision 2026-11-16), checked in EVERY git-tracked
 * text file (sources, tests, docs, generated API files):
 * - the old Bangla word for "conflict" is gone: the time clash is "সময় কনফ্লিক্ট", everything
 *   else "কনকারেন্ট সভা";
 * - v1.18 (owner decision 2026-11-23): the v1.5 Bangla term (Bangla "duplicate" + "সভা") never comes
 *   back, and the English term is "Concurrent meetings" (the old English term is checked in the
 *   message files, Swagger sources and generated API files);
 * - "কনকারেন্ট সভা" is never followed by a second "সভা";
 * - guests are "অতিথি কর্মকর্তা"; the phrase "outside guest" (Bangla) never appears;
 * - v1.13: the minutes are "সভা কার্যবিবরণী" / "Meeting minutes"; the old v1.11 name never appears
 *   again in the message files (frontend messages, backend *.messages.ts, the API catalog).
 * The words are built from code points, so this file does not contain them itself.
 */
const ch = (...codes: number[]): string => String.fromCharCode(...codes);
const OLD_CONFLICT_WORD = ch(0x09b8, 0x0982, 0x0998, 0x09be, 0x09a4);
const OUTSIDE_GUEST = `${ch(0x09ac, 0x09b9, 0x09bf, 0x09b0, 0x09be, 0x0997, 0x09a4)} ${ch(0x0985, 0x09a4, 0x09bf, 0x09a5, 0x09bf)}`;
const SHOVA = ch(0x09b8, 0x09ad, 0x09be);
// v1.5 term, replaced in v1.18: Bangla "duplicate" + SHOVA.
const OLD_DUPLICATE_SHOVA = `${ch(0x09a1, 0x09c1, 0x09aa, 0x09cd, 0x09b2, 0x09bf, 0x0995, 0x09c7, 0x099f)} ${SHOVA}`;
// v1.18 term: Bangla "concurrent" + SHOVA.
const CONCURRENT_SHOVA = `${ch(0x0995, 0x09a8, 0x0995, 0x09be, 0x09b0, 0x09c7, 0x09a8, 0x09cd, 0x099f)} ${SHOVA}`;
const DOUBLED = `${CONCURRENT_SHOVA} ${SHOVA}`;
// Old English term ("duplicate" + "meeting(s)"), split so this file does not contain it.
const OLD_EN_TERM = new RegExp(`\\b${'dupli'}cate[- ]meetings?\\b`, 'i');

const ROOT = join(__dirname, '..', '..', '..', '..');
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|md|css|html|csv|txt|ya?ml)$/;

function trackedTextFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((f) => TEXT.test(f));
}

function offending(word: string): string[] {
  const bad: string[] = [];
  for (const file of trackedTextFiles()) {
    let text: string;
    try {
      text = readFileSync(join(ROOT, file), 'utf8');
    } catch {
      continue; // deleted in the working tree
    }
    text.split('\n').forEach((line, i) => {
      if (line.includes(word)) bad.push(`${file}:${i + 1}`);
    });
  }
  return bad;
}

describe('v1.5 wording in every tracked file (SPEC.md §13.12)', () => {
  it('scans the repository', () => {
    const files = trackedTextFiles();
    expect(files).toContain('frontend/messages/bn.ts');
    expect(files).toContain('SPEC.md');
  });

  it('the words are what they claim to be', () => {
    expect(OLD_DUPLICATE_SHOVA.normalize('NFC')).toBe(OLD_DUPLICATE_SHOVA);
    expect(CONCURRENT_SHOVA.normalize('NFC')).toBe(CONCURRENT_SHOVA);
    expect(OLD_CONFLICT_WORD).toHaveLength(5);
    expect(OUTSIDE_GUEST.split(' ')).toHaveLength(2);
  });

  it('has no old word for "conflict"', () => {
    expect(offending(OLD_CONFLICT_WORD)).toEqual([]);
  });

  it('never doubles "সভা" after "কনকারেন্ট সভা"', () => {
    expect(offending(DOUBLED)).toEqual([]);
  });

  it('v1.18: the old Bangla term for concurrent meetings never comes back (any tracked file)', () => {
    expect(offending(OLD_DUPLICATE_SHOVA)).toEqual([]);
  });

  it('v1.18: "Concurrent meetings" — the old English term is gone from user-facing sources', () => {
    const files = trackedTextFiles().filter(
      (f) =>
        /^frontend\/messages\/(bn|en)\.ts$/.test(f) ||
        /^backend\/src\/.*\.(messages|controller|dto)\.ts$/.test(f) ||
        /^backend\/src\/modules\/.*\/dto\/.*\.ts$/.test(f) ||
        /^backend\/src\/(modules|common)\/.*\.(service|template|templates)\.ts$/.test(
          f,
        ) ||
        f === 'backend/src/common/i18n/message-catalog.ts' ||
        f === 'docs/openapi.json' ||
        f === 'docs/API.md' ||
        f === 'frontend/lib/api-schema.ts',
    );
    expect(files).toContain('frontend/messages/en.ts');
    expect(files).toContain('docs/openapi.json');
    const bad: string[] = [];
    for (const file of files) {
      readFileSync(join(ROOT, file), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (OLD_EN_TERM.test(line)) bad.push(`${file}:${i + 1}`);
        });
    }
    expect(bad).toEqual([]);
  });

  it('never says "outside guest": guests are "অতিথি কর্মকর্তা"', () => {
    expect(offending(OUTSIDE_GUEST)).toEqual([]);
  });

  it('v1.13: "সভা কার্যবিবরণী" / "Meeting minutes" — the old name never comes back in message files', () => {
    // The old Bangla name (SHOVA + "decision") and its English label, built from code points.
    const OLD_BN = `${SHOVA} ${ch(0x09b8, 0x09bf, 0x09a6, 0x09cd, 0x09a7, 0x09be, 0x09a8, 0x09cd, 0x09a4)}`;
    const OLD_EN = /Meeting decisions?\b|Upload decision\b/i;
    const messageFiles = trackedTextFiles().filter(
      (f) =>
        /^frontend\/messages\/(bn|en)\.ts$/.test(f) ||
        /^backend\/src\/.*\.messages\.ts$/.test(f) ||
        f === 'backend/src/common/i18n/message-catalog.ts' ||
        f === 'backend/src/modules/decisions/decisions.service.ts',
    );
    expect(messageFiles).toContain('frontend/messages/bn.ts');
    expect(messageFiles).toContain(
      'backend/src/modules/decisions/decisions.messages.ts',
    );
    const bad: string[] = [];
    for (const file of messageFiles) {
      readFileSync(join(ROOT, file), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (line.includes(OLD_BN) || OLD_EN.test(line))
            bad.push(`${file}:${i + 1}`);
        });
    }
    expect(bad).toEqual([]);
  });

  it('v1.6: the English UI texts (frontend/messages/en.ts) contain no Bangla characters', () => {
    const en = readFileSync(
      join(ROOT, 'frontend', 'messages', 'en.ts'),
      'utf8',
    );
    const lines = en
      .split('\n')
      .map((l, i) => ({ line: i + 1, l }))
      .filter(({ l }) => /[\u0980-\u09FF]/.test(l));
    expect(lines).toEqual([]);
  });
});
