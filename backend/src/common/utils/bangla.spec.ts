import {
  BANGLA_NUKTA,
  hasUnnormalizedBangla,
  normalizeBangla,
  normalizeBanglaDeep,
} from './bangla';

const { YYA, YA_NUKTA, RRA, DDA_NUKTA, RHA, DDHA_NUKTA } = BANGLA_NUKTA;

describe('normalizeBangla (SPEC.md §13.13)', () => {
  it('writes য় as য + ়', () => {
    expect(normalizeBangla(`সম${YYA}`)).toBe(`সম${YA_NUKTA}`);
    expect(normalizeBangla(`প্রল${YYA} বিষ${YYA}`)).toBe(
      `প্রল${YA_NUKTA} বিষ${YA_NUKTA}`,
    );
  });

  it('writes ড় and ঢ় precomposed', () => {
    expect(normalizeBangla(`ব${DDA_NUKTA}`)).toBe(`ব${RRA}`);
    expect(normalizeBangla(`আষা${DDHA_NUKTA}`)).toBe(`আষা${RHA}`);
  });

  it('keeps forms that are already right and everything else', () => {
    const ok = `সম${YA_NUKTA}, ব${RRA}, আষা${RHA}, English 0-9, ০-৯`;
    expect(normalizeBangla(ok)).toBe(ok);
    expect(normalizeBangla('')).toBe('');
    expect(normalizeBangla('plain ascii')).toBe('plain ascii');
  });

  it('is idempotent and never re-composes with NFC', () => {
    const once = normalizeBangla(`${YYA}${DDA_NUKTA}${DDHA_NUKTA}`);
    expect(normalizeBangla(once)).toBe(once);
    expect(once).toBe(`${YA_NUKTA}${RRA}${RHA}`);
    expect(hasUnnormalizedBangla(once)).toBe(false);
  });

  it('detects text that still needs normalising', () => {
    expect(hasUnnormalizedBangla(YYA)).toBe(true);
    expect(hasUnnormalizedBangla(DDA_NUKTA)).toBe(true);
    expect(hasUnnormalizedBangla(DDHA_NUKTA)).toBe(true);
    expect(hasUnnormalizedBangla(`${YA_NUKTA}${RRA}${RHA}`)).toBe(false);
  });
});

describe('normalizeBanglaDeep', () => {
  it('normalises nested strings and arrays, keeps secrets and non-plain objects', () => {
    const date = new Date(0);
    const input = {
      nameBn: `প্রল${YYA}`,
      charges: [`ব${DDA_NUKTA}`],
      nested: { title: `আষা${DDHA_NUKTA}`, count: 3, flag: true, none: null },
      password: `pass${YYA}1`,
      currentPassword: `pass${YYA}2`,
      token: `t${YYA}`,
      at: date,
    };
    const out = normalizeBanglaDeep(input) as typeof input;
    expect(out.nameBn).toBe(`প্রল${YA_NUKTA}`);
    expect(out.charges).toEqual([`ব${RRA}`]);
    expect(out.nested).toEqual({
      title: `আষা${RHA}`,
      count: 3,
      flag: true,
      none: null,
    });
    expect(out.password).toBe(`pass${YYA}1`);
    expect(out.currentPassword).toBe(`pass${YYA}2`);
    expect(out.token).toBe(`t${YYA}`);
    expect(out.at).toBe(date);
  });
});
