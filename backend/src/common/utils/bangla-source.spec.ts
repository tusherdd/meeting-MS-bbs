import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BANGLA_NUKTA, hasUnnormalizedBangla } from './bangla';

/**
 * SPEC.md §13.13: no source file (backend, frontend, tests, docs) may contain a Bangla nukta
 * letter in a form the fonts draw broken: U+09DF (precomposed YYA), DDA + NUKTA or DDHA + NUKTA.
 * Fix a failure with normalizeBangla() rules: YYA as YA + NUKTA, RRA / RHA precomposed.
 */
const ROOT = join(__dirname, '..', '..', '..', '..');
const SCAN = [
  'backend/src',
  'backend/test',
  'backend/scripts',
  'frontend/app',
  'frontend/components',
  'frontend/lib',
  'frontend/messages',
  'frontend/providers',
  'frontend/e2e',
  'docs',
];
const ROOT_FILES = ['SPEC.md', 'README.md', 'CLAUDE.md', 'backend/README.md'];
const EXTENSIONS = /\.(ts|tsx|js|mjs|json|md|css|html|csv)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'data', '.state']);

function files(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // folder does not exist (e.g. frontend/providers)
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return SKIP_DIRS.has(name) ? [] : files(path);
    return EXTENSIONS.test(name) ? [path] : [];
  });
}

describe('source files use the stored Bangla nukta forms (SPEC.md §13.13)', () => {
  it('finds the files to scan', () => {
    expect(files(join(ROOT, 'frontend/messages')).length).toBeGreaterThan(0);
    expect(files(join(ROOT, 'backend/src')).length).toBeGreaterThan(50);
  });

  it('has no U+09DF, DDA + NUKTA or DDHA + NUKTA in any source file', () => {
    const all = [
      ...SCAN.flatMap((d) => files(join(ROOT, d))),
      ...ROOT_FILES.map((f) => join(ROOT, f)),
    ];
    const bad: string[] = [];
    for (const path of all) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (hasUnnormalizedBangla(line))
            bad.push(`${relative(ROOT, path)}:${i + 1}`);
        });
    }
    expect(bad).toEqual([]);
  });

  it('the check itself catches each broken form', () => {
    expect(hasUnnormalizedBangla(BANGLA_NUKTA.YYA)).toBe(true);
    expect(hasUnnormalizedBangla(BANGLA_NUKTA.DDA_NUKTA)).toBe(true);
    expect(hasUnnormalizedBangla(BANGLA_NUKTA.DDHA_NUKTA)).toBe(true);
  });
});
