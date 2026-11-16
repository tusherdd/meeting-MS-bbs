import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getMetadataStorage } from 'class-validator';
import { checkPasswordStrength } from '../utils/password';
import { validationMessages } from '../pipes/validation.pipe';
import { GENERIC_SERVER_ERROR_MESSAGE } from '../filters/all-exceptions.filter';
import { AUTH_MESSAGES } from '../../modules/auth/auth.messages';
import { CHANGE_REQUEST_MESSAGES } from '../../modules/change-requests/change-requests.messages';
import { DESIGNATION_MESSAGES } from '../../modules/designations/designations.messages';
import { MEETING_MESSAGES } from '../../modules/meetings/meetings.messages';
import { PROFILE_MESSAGES } from '../../modules/profile/profile.messages';
import { USER_MESSAGES } from '../../modules/users/users.messages';
import { WING_MESSAGES } from '../../modules/wings/wings.messages';
import { MESSAGE_CATALOG, PARAM_TRANSLATIONS } from './message-catalog';
import { lookupMessage, messageText } from './translate';

const BANGLA = /[ঀ-৿]/;
const SRC = join(__dirname, '..', '..');

/**
 * Texts in the message files that are not API messages and so stay out of the catalog:
 * bell-notification texts (always Bangla, SPEC.md §13.14), a label used inside them, and
 * the placeholder title of a hidden meeting (data; clients use `titleHidden`).
 */
const NOT_API_MESSAGES = new Set([
  'CHANGE_REQUEST_MESSAGES.typeLabel.DESIGNATION',
  'CHANGE_REQUEST_MESSAGES.submittedTitle',
  'CHANGE_REQUEST_MESSAGES.submittedBody',
  'CHANGE_REQUEST_MESSAGES.decidedTitle',
  'CHANGE_REQUEST_MESSAGES.decidedBody',
  'MEETING_MESSAGES.hiddenTitle',
]);

/** Every Bangla text of a messages object; functions are called with sample arguments. */
function textsOf(
  name: string,
  value: unknown,
): { key: string; text: string }[] {
  if (typeof value === 'string') return [{ key: name, text: value }];
  if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown;
    const args = Array.from(
      { length: fn.length },
      (_, i) => `x${i}@example.test`,
    );
    return textsOf(name, fn(...args));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) =>
      textsOf(`${name}.${k}`, v),
    );
  }
  return [];
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('API message catalog (v1.6)', () => {
  const entries = Object.entries(MESSAGE_CATALOG);

  it('has unique Bangla and English texts with the same placeholders', () => {
    const bn = new Set<string>();
    const en = new Set<string>();
    for (const [code, e] of entries) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(bn.has(e.bn)).toBe(false);
      expect(en.has(e.en)).toBe(false);
      bn.add(e.bn);
      en.add(e.en);
      const names = (s: string) =>
        [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(names(e.en)).toEqual(names(e.bn));
    }
  });

  it('has no Bangla characters in the English texts', () => {
    for (const [code, e] of entries) {
      expect({ code, bangla: BANGLA.test(e.en) }).toEqual({
        code,
        bangla: false,
      });
    }
    for (const en of Object.values(PARAM_TRANSLATIONS))
      expect(BANGLA.test(en)).toBe(false);
  });

  it('finds every Bangla text of the message files', () => {
    const groups = {
      AUTH_MESSAGES,
      CHANGE_REQUEST_MESSAGES,
      DESIGNATION_MESSAGES,
      MEETING_MESSAGES,
      PROFILE_MESSAGES,
      USER_MESSAGES,
      WING_MESSAGES,
    };
    const missing = Object.entries(groups)
      .flatMap(([name, group]) => textsOf(name, group))
      .filter(
        ({ key }) =>
          ![...NOT_API_MESSAGES].some(
            (k) => key === k || key.startsWith(`${k}.`),
          ),
      )
      .filter(({ text }) => BANGLA.test(text) && !lookupMessage(text))
      .map(({ key, text }) => `${key}: ${text}`);
    expect(missing).toEqual([]);
  });

  it('finds every Bangla validation message of every DTO', () => {
    for (const file of walk(SRC).filter((f) => /\.dto\.ts$/.test(f))) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- load DTO decorators
      require(file);
    }
    const metadata = getMetadataStorage() as unknown as {
      validationMetadatas: Map<unknown, { message?: unknown }[]>;
    };
    const messages = [...metadata.validationMetadatas.values()]
      .flat()
      .map((m) => m.message)
      .filter((m): m is string => typeof m === 'string' && BANGLA.test(m));
    expect(messages.length).toBeGreaterThan(50);
    expect(messages.filter((m) => !lookupMessage(m))).toEqual([]);
  });

  it('finds the Bangla texts thrown directly in the code', () => {
    const inline = walk(SRC)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .flatMap((f) =>
        [
          ...readFileSync(f, 'utf8').matchAll(
            /(?:Exception\(\s*|errorMessage:\s*)'([^']*[ঀ-৿][^']*)'/g,
          ),
        ].map((m) => m[1]),
      );
    expect(inline.length).toBeGreaterThan(3);
    const others = [
      ...inline,
      ...checkPasswordStrength('a', 'a'),
      ...validationMessages([
        { property: 'role', constraints: { whitelistValidation: 'x' } },
      ]),
      GENERIC_SERVER_ERROR_MESSAGE,
    ];
    expect(others.filter((m) => !lookupMessage(m))).toEqual([]);
  });

  it('translates exact texts and templates (numbers and labels become English)', () => {
    expect(lookupMessage(MESSAGE_CATALOG.INVALID_ID.bn)?.code).toBe(
      'INVALID_ID',
    );
    const inUse = lookupMessage(WING_MESSAGES.inUse(12));
    expect(inUse?.code).toBe('WING_IN_USE');
    expect(messageText('WING_IN_USE', 'en', inUse!.params)).toContain(
      '12 officers',
    );
    const field = lookupMessage(USER_MESSAGES.fieldRequired('ইংরেজি নাম'));
    expect(messageText(field!.code, 'en', field!.params)).toBe(
      'Name (English) cannot be empty.',
    );
    expect(messageText(field!.code, 'bn', field!.params)).toBe(
      'ইংরেজি নাম খালি রাখা যাবে না।',
    );
    const guest = lookupMessage(
      MEETING_MESSAGES.guestIsOfficer('a@b.test', 'করিম'),
    );
    expect(messageText(guest!.code, 'en', guest!.params)).toContain('a@b.test');
  });
});
