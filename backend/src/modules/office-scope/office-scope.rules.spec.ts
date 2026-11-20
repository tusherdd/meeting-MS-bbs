import { OfficeReportScope as S } from '../designations/enums/office-report-scope.enum';
import { UserRole } from '../users/enums/user-role.enum';
import {
  chargeDesignation,
  maxScope,
  resolveScope,
  type ScopedDesignation,
} from './office-scope.rules';

const d = (
  id: string,
  nameBn: string,
  nameEn: string,
  officeReportScope: S,
): ScopedDesignation => ({ id, nameBn, nameEn, officeReportScope });

const DESIGNATIONS = [
  d('sec', 'সচিব', 'Secretary', S.OFFICE),
  d('dg', 'মহাপরিচালক', 'Director General', S.OFFICE),
  d('ddg', 'উপমহাপরিচালক', 'Deputy Director General', S.NONE),
  d('dir', 'পরিচালক', 'Director', S.WING),
  d('dd', 'উপপরিচালক', 'Deputy Director', S.NONE),
  d('prog', 'প্রোগ্রামার', 'Programmer', S.NONE),
];

describe('office report scope (v1.15)', () => {
  it('maxScope: NONE < WING < OFFICE', () => {
    expect(maxScope()).toBe(S.NONE);
    expect(maxScope(S.NONE, null, undefined)).toBe(S.NONE);
    expect(maxScope(S.WING, S.NONE)).toBe(S.WING);
    expect(maxScope(S.WING, S.OFFICE, S.NONE)).toBe(S.OFFICE);
  });

  it('NONE, WING and OFFICE come from the designation', () => {
    const base = {
      role: UserRole.OFFICER,
      charges: [],
      designations: DESIGNATIONS,
    };
    expect(resolveScope({ ...base, designationScope: S.NONE })).toBe(S.NONE);
    expect(resolveScope({ ...base, designationScope: S.WING })).toBe(S.WING);
    expect(resolveScope({ ...base, designationScope: S.OFFICE })).toBe(
      S.OFFICE,
    );
    expect(resolveScope({ ...base, designationScope: null })).toBe(S.NONE);
  });

  it('ADMIN and SUPER_ADMIN always have OFFICE', () => {
    for (const role of [UserRole.ADMIN, UserRole.SUPER_ADMIN]) {
      expect(
        resolveScope({
          role,
          designationScope: null,
          charges: [],
          designations: DESIGNATIONS,
        }),
      ).toBe(S.OFFICE);
    }
  });

  it('an additional charge adds the scope of the designation it names (highest wins)', () => {
    const base = {
      role: UserRole.OFFICER,
      designationScope: S.NONE,
      designations: DESIGNATIONS,
    };
    expect(
      resolveScope({ ...base, charges: ['পরিচালক (বিকল্প), সেন্সাস উইং'] }),
    ).toBe(S.WING);
    expect(
      resolveScope({
        ...base,
        charges: ['এসডিজি সেল', 'মহাপরিচালক (চলতি দায়িত্ব)'],
      }),
    ).toBe(S.OFFICE);
    expect(resolveScope({ ...base, charges: ['Director (additional)'] })).toBe(
      S.WING,
    );
    // A WING designation is not lowered by a NONE charge.
    expect(
      resolveScope({
        ...base,
        designationScope: S.WING,
        charges: ['উপপরিচালক'],
      }),
    ).toBe(S.WING);
  });

  it('charge matching: whole word at the start, longest name, no partial words', () => {
    expect(chargeDesignation('পরিচালক', DESIGNATIONS)?.id).toBe('dir');
    expect(
      chargeDesignation('উপপরিচালক, কম্পিউটার উইং', DESIGNATIONS)?.id,
    ).toBe('dd');
    expect(chargeDesignation('উপমহাপরিচালক', DESIGNATIONS)?.id).toBe('ddg');
    expect(chargeDesignation('মহাপরিচালক', DESIGNATIONS)?.id).toBe('dg');
    expect(chargeDesignation('Deputy Director General', DESIGNATIONS)?.id).toBe(
      'ddg',
    );
    expect(chargeDesignation('director general', DESIGNATIONS)?.id).toBe('dg');
    expect(chargeDesignation('এসডিজি সেল', DESIGNATIONS)).toBeNull();
    expect(
      chargeDesignation('ফোকাল পয়েন্ট কর্মকর্তা, এসডিজি সেল', DESIGNATIONS),
    ).toBeNull();
    // "পরিচালকের" is another word (a vowel sign follows), not the designation.
    expect(chargeDesignation('পরিচালকের সহকারী', DESIGNATIONS)).toBeNull();
    expect(chargeDesignation('Directorate liaison', DESIGNATIONS)).toBeNull();
  });
});
