import { UserRole } from '../../modules/users/enums/user-role.enum';
import {
  OFFICER_CSV_COLUMNS,
  parseOfficerCsv,
  type OfficerCsvRow,
} from './officer-csv';
import {
  collectCsvWings,
  lookupKey,
  mapOfficerRows,
  rowLabel,
  splitCharges,
  type OfficerLookups,
} from './officer-mapper';
import { mergeWingSeeds } from './run-seed';
import { DESIGNATIONS, EXTRA_WINGS } from './seed-data';
import { SeedDataError } from './seed-errors';

// Fictional test data only — never real officers.
let line = 1;
function csvRow(overrides: Partial<OfficerCsvRow> = {}): OfficerCsvRow {
  line++;
  return {
    line,
    source_sl: String(line),
    name_bn: 'পরীক্ষা কর্মকর্তা',
    name_en: 'Test Officer',
    designation_bn: 'উপপরিচালক',
    designation_en: 'Deputy Director',
    designation_remark: '',
    wing_bn: 'কম্পিউটার উইং',
    wing_en: 'Computer Wing',
    organization_bn: 'বাংলাদেশ পরিসংখ্যান ব্যুরো',
    organization_en: 'Bangladesh Bureau of Statistics',
    login_email: `officer${line}@example.test`,
    mobile: '01700000000',
    mobile_alt: '',
    office_phone: '',
    fax: '',
    additional_charges: '',
    role: 'OFFICER',
    ...overrides,
  };
}

const lookups: OfficerLookups = {
  designationIdByNameEn: new Map([
    [lookupKey('Deputy Director'), 'designation-dd'],
    [lookupKey('Statistical Officer'), 'designation-so'],
  ]),
  wingIdByNameEn: new Map([[lookupKey('Computer Wing'), 'wing-computer']]),
  reservedEmails: new Set(['admin@example.test']),
};

function expectSeedError(fn: () => unknown, pattern: RegExp): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SeedDataError);
    expect((err as SeedDataError).problems.join('\n')).toMatch(pattern);
    return;
  }
  throw new Error('expected SeedDataError');
}

describe('officer CSV mapping', () => {
  describe('designation and wing lookup', () => {
    it('maps designation_en and wing_en to ids (case/space-insensitive)', () => {
      const { officers } = mapOfficerRows(
        [
          csvRow({
            designation_en: '  deputy   DIRECTOR ',
            wing_en: 'computer wing',
          }),
        ],
        lookups,
      );
      expect(officers[0]).toMatchObject({
        designationId: 'designation-dd',
        wingId: 'wing-computer',
      });
    });

    it('allows a row without wing (wingId = null)', () => {
      const { officers } = mapOfficerRows(
        [csvRow({ wing_en: '', wing_bn: '' })],
        lookups,
      );
      expect(officers[0].wingId).toBeNull();
    });

    it('fails loudly on an unknown designation, naming the row', () => {
      expectSeedError(
        () =>
          mapOfficerRows(
            [csvRow({ source_sl: '42', designation_en: 'Chief Wizard' })],
            lookups,
          ),
        /source_sl 42: designation_en "Chief Wizard" matches no designation/,
      );
    });

    it('fails loudly on an unknown wing', () => {
      expectSeedError(
        () => mapOfficerRows([csvRow({ wing_en: 'Moon Wing' })], lookups),
        /wing_en "Moon Wing" matches no wing/,
      );
    });

    it('fails on a missing designation (only the super admin may have none)', () => {
      expectSeedError(
        () => mapOfficerRows([csvRow({ designation_en: '' })], lookups),
        /designation_en is required/,
      );
    });

    it('reports all fatal problems at once', () => {
      expectSeedError(
        () =>
          mapOfficerRows(
            [csvRow({ designation_en: 'X' }), csvRow({ wing_en: 'Y' })],
            lookups,
          ),
        /matches no designation[\s\S]*matches no wing/,
      );
    });
  });

  describe('additional charges', () => {
    it('splits on " | ", trims, drops empties and duplicates', () => {
      expect(
        splitCharges(' এসডিজি সেল | ফোকাল পয়েন্ট |  | এসডিজি সেল '),
      ).toEqual(['এসডিজি সেল', 'ফোকাল পয়েন্ট']);
    });

    it('keeps commas inside one charge', () => {
      expect(splitCharges('ফোকাল পয়েন্ট কর্মকর্তা, এসডিজি সেল')).toEqual([
        'ফোকাল পয়েন্ট কর্মকর্তা, এসডিজি সেল',
      ]);
    });

    it('returns [] for an empty cell', () => {
      expect(splitCharges('')).toEqual([]);
    });
  });

  describe('skip rules', () => {
    it('skips a row without login_email (reported by source_sl)', () => {
      const result = mapOfficerRows(
        [csvRow({ source_sl: '71', login_email: ' ' })],
        lookups,
      );
      expect(result.officers).toHaveLength(0);
      expect(result.skipped).toEqual([
        { row: 'source_sl 71', reason: 'no login_email' },
      ]);
    });

    it('skips an invalid email', () => {
      const { skipped } = mapOfficerRows(
        [csvRow({ login_email: 'not-an-email' })],
        lookups,
      );
      expect(skipped[0].reason).toBe('invalid login_email format');
    });

    it('skips the second row with the same email (case-insensitive)', () => {
      const { officers, skipped } = mapOfficerRows(
        [
          csvRow({ source_sl: '1', login_email: 'same@example.test' }),
          csvRow({ source_sl: '2', login_email: 'SAME@example.test' }),
        ],
        lookups,
      );
      expect(officers).toHaveLength(1);
      expect(skipped).toEqual([
        {
          row: 'source_sl 2',
          reason: 'duplicate login_email (same as source_sl 1)',
        },
      ]);
    });

    it('skips the super admin email', () => {
      const { skipped } = mapOfficerRows(
        [csvRow({ login_email: 'Admin@example.test' })],
        lookups,
      );
      expect(skipped[0].reason).toMatch(/reserved for the super admin/);
    });

    it('skip reasons never contain the email itself', () => {
      const { skipped } = mapOfficerRows(
        [
          csvRow({ login_email: 'a@x.test' }),
          csvRow({ login_email: 'a@x.test' }),
        ],
        lookups,
      );
      expect(JSON.stringify(skipped)).not.toContain('a@x.test');
    });
  });

  describe('field mapping', () => {
    it('lowercases email, trims text, maps role and organization', () => {
      const { officers } = mapOfficerRows(
        [
          csvRow({
            login_email: ' Officer.X@Example.TEST ',
            designation_remark: ' চলতি দায়িত্ব ',
            role: '',
          }),
        ],
        lookups,
      );
      expect(officers[0]).toMatchObject({
        loginEmail: 'officer.x@example.test',
        designationRemark: 'চলতি দায়িত্ব',
        organizationEn: 'Bangladesh Bureau of Statistics',
        role: UserRole.OFFICER,
      });
    });

    it('accepts ADMIN but refuses SUPER_ADMIN from the CSV', () => {
      expect(
        mapOfficerRows([csvRow({ role: 'admin' })], lookups).officers[0].role,
      ).toBe(UserRole.ADMIN);
      expectSeedError(
        () => mapOfficerRows([csvRow({ role: 'SUPER_ADMIN' })], lookups),
        /role "SUPER_ADMIN" is not allowed/,
      );
    });

    it('labels a row with blank source_sl by its file line', () => {
      expect(rowLabel({ source_sl: '', line: 2 })).toBe('row 2');
    });
  });

  describe('phone numbers', () => {
    it('keeps valid numbers', () => {
      const { officers, warnings } = mapOfficerRows(
        [csvRow({ mobile: '01711111111', office_phone: '+880 2 5500 7373' })],
        lookups,
      );
      expect(officers[0]).toMatchObject({
        mobile: '01711111111',
        officePhone: '+880 2 5500 7373',
      });
      expect(warnings).toEqual([]);
    });

    it('stores NULL and warns for Excel scientific notation', () => {
      const { officers, warnings } = mapOfficerRows(
        [
          csvRow({
            source_sl: '',
            office_phone: '8.80255E+11',
            fax: '8.80255E+11',
          }),
        ],
        lookups,
      );
      expect(officers[0].officePhone).toBeNull();
      expect(officers[0].fax).toBeNull();
      expect(warnings).toHaveLength(2);
      expect(warnings[0].reason).toMatch(
        /office_phone is in scientific notation/,
      );
      expect(JSON.stringify(warnings)).not.toContain('8.80255');
    });
  });
});

describe('wings', () => {
  it('collects distinct CSV wings and ignores rows without a wing', () => {
    const wings = collectCsvWings([
      csvRow(),
      csvRow(),
      csvRow({ wing_en: '', wing_bn: '' }),
      csvRow({ wing_en: 'Census Wing', wing_bn: 'সেন্সাস উইং' }),
    ]);
    expect(wings.map((w) => w.nameEn)).toEqual([
      'Computer Wing',
      'Census Wing',
    ]);
  });

  it('fails when one wing_en has two different Bangla names', () => {
    expectSeedError(
      () => collectCsvWings([csvRow(), csvRow({ wing_bn: 'অন্য নাম' })]),
      /different wing_bn/,
    );
  });

  it('adds the five cells without duplicating existing names', () => {
    const merged = mergeWingSeeds(
      [
        { nameEn: 'SDG Cell', nameBn: 'এসডিজি সেল' },
        { nameEn: 'Computer Wing', nameBn: 'ক' },
      ],
      EXTRA_WINGS,
    );
    expect(merged).toHaveLength(6);
    expect(merged.filter((w) => w.nameEn === 'SDG Cell')).toHaveLength(1);
  });
});

describe('seed data', () => {
  it('matches the SPEC §6.1 designation table (15 rows, unique names)', () => {
    expect(DESIGNATIONS).toHaveLength(15);
    expect(new Set(DESIGNATIONS.map((d) => lookupKey(d.nameEn))).size).toBe(15);
    expect(
      DESIGNATIONS.find((d) => d.nameEn === 'System Analyst')?.priority,
    ).toBe(5);
  });
});

describe('parseOfficerCsv', () => {
  const header = OFFICER_CSV_COLUMNS.join(',');

  it('handles a UTF-8 BOM, quoted commas and records line numbers', () => {
    const values = OFFICER_CSV_COLUMNS.map((c) =>
      c === 'additional_charges'
        ? '"ফোকাল, সেল | এসডিজি সেল"'
        : c === 'name_bn'
          ? 'নাম'
          : '',
    );
    const rows = parseOfficerCsv(`\uFEFF${header}\n${values.join(',')}\n`);
    expect(rows).toHaveLength(1);
    expect(rows[0].name_bn).toBe('নাম');
    expect(rows[0].additional_charges).toBe('ফোকাল, সেল | এসডিজি সেল');
    expect(rows[0].line).toBe(2);
  });

  it('rejects a file with missing columns', () => {
    expect(() => parseOfficerCsv('source_sl,name_bn\n1,x\n')).toThrow(
      SeedDataError,
    );
  });
});
