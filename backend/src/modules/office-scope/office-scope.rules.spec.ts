import { OfficeReportScope as S } from '../designations/enums/office-report-scope.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { maxScope, resolveScope, scopeWingIds } from './office-scope.rules';

describe('office report scope (v1.15, structured charges v1.16)', () => {
  it('maxScope: NONE < WING < OFFICE', () => {
    expect(maxScope()).toBe(S.NONE);
    expect(maxScope(S.NONE, null, undefined)).toBe(S.NONE);
    expect(maxScope(S.WING, S.NONE)).toBe(S.WING);
    expect(maxScope(S.WING, S.OFFICE, S.NONE)).toBe(S.OFFICE);
  });

  it('NONE, WING and OFFICE come from the designation', () => {
    const base = { role: UserRole.OFFICER, charges: [] };
    expect(resolveScope({ ...base, designationScope: S.NONE })).toBe(S.NONE);
    expect(resolveScope({ ...base, designationScope: S.WING })).toBe(S.WING);
    expect(resolveScope({ ...base, designationScope: S.OFFICE })).toBe(
      S.OFFICE,
    );
    expect(resolveScope({ ...base, designationScope: null })).toBe(S.NONE);
  });

  it('ADMIN and SUPER_ADMIN always have OFFICE', () => {
    for (const role of [UserRole.ADMIN, UserRole.SUPER_ADMIN]) {
      expect(resolveScope({ role, designationScope: null, charges: [] })).toBe(
        S.OFFICE,
      );
    }
  });

  it('an additional charge adds the scope of ITS designation (highest wins); needs-review rows count for nothing', () => {
    const base = { role: UserRole.OFFICER, designationScope: S.NONE };
    expect(
      resolveScope({ ...base, charges: [{ scope: S.WING, wingId: null }] }),
    ).toBe(S.WING);
    expect(
      resolveScope({
        ...base,
        charges: [
          { scope: S.WING, wingId: 'w2' },
          { scope: S.OFFICE, wingId: null },
        ],
      }),
    ).toBe(S.OFFICE);
    expect(
      resolveScope({ ...base, charges: [{ scope: null, wingId: 'w2' }] }),
    ).toBe(S.NONE);
    // A NONE charge never lowers a WING designation.
    expect(
      resolveScope({
        ...base,
        designationScope: S.WING,
        charges: [{ scope: S.NONE, wingId: 'w3' }],
      }),
    ).toBe(S.WING);
  });

  it('WING wings: own wing first, plus the wing of every WING-scope charge', () => {
    expect(scopeWingIds('w1', [])).toEqual(['w1']);
    expect(
      scopeWingIds('w1', [
        { scope: S.WING, wingId: 'w2' },
        { scope: S.WING, wingId: null },
        { scope: S.NONE, wingId: 'w3' },
        { scope: null, wingId: 'w4' },
        { scope: S.WING, wingId: 'w1' },
      ]),
    ).toEqual(['w1', 'w2']);
    // No own wing, but a WING charge with a wing → that wing only.
    expect(scopeWingIds(null, [{ scope: S.WING, wingId: 'w2' }])).toEqual([
      'w2',
    ]);
    expect(scopeWingIds(null, [])).toEqual([]);
  });
});
