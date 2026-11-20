import type { DataSource } from 'typeorm';
import { OfficeReportScope as S } from '../designations/enums/office-report-scope.enum';
import { OfficeScopeService, type OfficeAccess } from './office-scope.service';

/** v1.15: read-only access of office report viewers to meetings (SPEC.md §6.10). */
describe('OfficeScopeService.canViewMeeting', () => {
  const actor = { id: 'viewer' };
  const wing = { id: 'w1', nameBn: 'উইং এক', nameEn: 'Wing One' };
  const charge = { id: 'w2', nameBn: 'উইং দুই', nameEn: 'Wing Two' };
  const make = (rows: unknown[]) => {
    const query = jest.fn().mockResolvedValue(rows);
    return {
      query,
      service: new OfficeScopeService({ query } as unknown as DataSource),
    };
  };

  it('OFFICE sees every meeting without a query', async () => {
    const { query, service } = make([]);
    const access: OfficeAccess = { scope: S.OFFICE, wing: null, wings: [] };
    await expect(service.canViewMeeting(actor, 'm', access)).resolves.toBe(
      true,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('NONE and WING without a wing see nothing', async () => {
    const { query, service } = make([{ ok: 1 }]);
    await expect(
      service.canViewMeeting(actor, 'm', {
        scope: S.NONE,
        wing: null,
        wings: [],
      }),
    ).resolves.toBe(false);
    await expect(
      service.canViewMeeting(actor, 'm', {
        scope: S.WING,
        wing: null,
        wings: [],
      }),
    ).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('WING: only meetings organized by, or with an officer of, the own wing (checked in SQL)', async () => {
    const inScope = make([{ ok: 1 }]);
    await expect(
      inScope.service.canViewMeeting(actor, 'm1', {
        scope: S.WING,
        wing,
        wings: [wing, charge],
      }),
    ).resolves.toBe(true);
    const [sql, params] = inScope.query.mock.calls[0] as [string, unknown[]];
    // v1.16: own wing AND the wing of a WING-scope additional charge.
    expect(params).toEqual(['m1', ['w1', 'w2']]);
    expect(sql).toContain('o."wingId" = ANY($2::uuid[])');
    expect(sql).toContain('u."wingId" = ANY($2::uuid[])');

    const other = make([]);
    await expect(
      other.service.canViewMeeting(actor, 'm2', {
        scope: S.WING,
        wing,
        wings: [wing],
      }),
    ).resolves.toBe(false);
  });
});
