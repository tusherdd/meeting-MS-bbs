import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import { OfficeReportScope } from '../designations/enums/office-report-scope.enum';
import { User } from '../users/entities/user.entity';
import { Wing } from '../wings/entities/wing.entity';
import {
  resolveScope,
  scopeWingIds,
  type ScopeCharge,
} from './office-scope.rules';

export interface WingRef {
  id: string;
  nameBn: string;
  nameEn: string;
}

export interface OfficeAccess {
  scope: OfficeReportScope;
  /** The viewer's own wing (null = no wing). */
  wing: WingRef | null;
  /**
   * WING viewers: the wings they may see — own wing first, then (v1.16) the wings of their
   * WING-scope additional charges. Empty for OFFICE and NONE.
   */
  wings: WingRef[];
}

/**
 * v1.15 (SPEC.md §6.10): the viewer's office report scope, and read-only access of report viewers
 * to meetings in their scope (meeting detail, notice, minutes). Used by reports, meetings,
 * notices, decisions and /auth/me. v1.16: additional charges count by their structured designation.
 */
@Injectable()
export class OfficeScopeService {
  constructor(private readonly dataSource: DataSource) {}

  async access(actor: Pick<AuthUser, 'id'>): Promise<OfficeAccess> {
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: actor.id },
      relations: {
        designation: true,
        wing: true,
        additionalCharges: { designation: true },
      },
    });
    if (!user) return { scope: OfficeReportScope.NONE, wing: null, wings: [] };
    const charges: ScopeCharge[] = (user.additionalCharges ?? []).map((c) => ({
      scope: c.designation?.officeReportScope ?? null,
      wingId: c.wingId,
    }));
    const scope = resolveScope({
      role: user.role,
      designationScope: user.designation?.officeReportScope ?? null,
      charges,
    });
    const own = user.wing
      ? { id: user.wing.id, nameBn: user.wing.nameBn, nameEn: user.wing.nameEn }
      : null;
    if (scope !== OfficeReportScope.WING)
      return { scope, wing: own, wings: [] };

    const ids = scopeWingIds(user.wingId, charges);
    const found =
      ids.length > 0
        ? await this.dataSource.getRepository(Wing).find({
            select: { id: true, nameBn: true, nameEn: true },
            where: { id: In(ids) },
          })
        : [];
    const byId = new Map(found.map((w) => [w.id, w]));
    const wings = ids
      .map((id) => byId.get(id))
      .filter((w): w is Wing => !!w)
      .map((w) => ({ id: w.id, nameBn: w.nameBn, nameEn: w.nameEn }));
    return { scope, wing: own, wings };
  }

  /**
   * May a report viewer open this meeting read-only? OFFICE: every meeting. WING: meetings
   * organized by an officer of one of their wings, or with any officer of those wings among its
   * people.
   */
  async canViewMeeting(
    actor: Pick<AuthUser, 'id'>,
    meetingId: string,
    known?: OfficeAccess,
  ): Promise<boolean> {
    const access = known ?? (await this.access(actor));
    if (access.scope === OfficeReportScope.OFFICE) return true;
    if (access.scope !== OfficeReportScope.WING || access.wings.length === 0)
      return false;
    const rows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok FROM meetings m
       JOIN users o ON o.id = m."organizerId"
       WHERE m.id = $1 AND (
         o."wingId" = ANY($2::uuid[]) OR EXISTS (
           SELECT 1 FROM meeting_participants mp JOIN users u ON u.id = mp."userId"
           WHERE mp."meetingId" = m.id AND u."wingId" = ANY($2::uuid[])))
       LIMIT 1`,
      [meetingId, access.wings.map((w) => w.id)],
    );
    return rows.length > 0;
  }
}
