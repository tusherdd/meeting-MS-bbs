import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Wording rules of v1.5 (SPEC.md §13.12, owner decision 2026-11-16), checked in EVERY git-tracked
 * text file (sources, tests, docs, generated API files):
 * - the old Bangla word for "conflict" is gone: the time clash is "সময় কনফ্লিক্ট", everything
 *   else "ডুপ্লিকেট সভা";
 * - "ডুপ্লিকেট সভা" is never followed by a second "সভা";
 * - guests are "অতিথি কর্মকর্তা"; the phrase "outside guest" (Bangla) never appears.
 * The words are built from code points, so this file does not contain them itself.
 */
const ch = (...codes: number[]): string => String.fromCharCode(...codes);
const OLD_CONFLICT_WORD = ch(0x09b8, 0x0982, 0x0998, 0x09be, 0x09a4);
const OUTSIDE_GUEST = `${ch(0x09ac, 0x09b9, 0x09bf, 0x09b0, 0x09be, 0x0997, 0x09a4)} ${ch(0x0985, 0x09a4, 0x09bf, 0x09a5, 0x09bf)}`;
const SHOVA = ch(0x09b8, 0x09ad, 0x09be);
const DUPLICATE_SHOVA = `${ch(0x09a1, 0x09c1, 0x09aa, 0x09cd, 0x09b2, 0x09bf, 0x0995, 0x09c7, 0x099f)} ${SHOVA}`;
const DOUBLED = `${DUPLICATE_SHOVA} ${SHOVA}`;

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
    expect(DUPLICATE_SHOVA.normalize('NFC')).toBe(DUPLICATE_SHOVA);
    expect(OLD_CONFLICT_WORD).toHaveLength(5);
    expect(OUTSIDE_GUEST.split(' ')).toHaveLength(2);
  });

  it('has no old word for "conflict"', () => {
    expect(offending(OLD_CONFLICT_WORD)).toEqual([]);
  });

  it('never doubles "সভা" after "ডুপ্লিকেট সভা"', () => {
    expect(offending(DOUBLED)).toEqual([]);
  });

  it('never says "outside guest": guests are "অতিথি কর্মকর্তা"', () => {
    expect(offending(OUTSIDE_GUEST)).toEqual([]);
  });
});
