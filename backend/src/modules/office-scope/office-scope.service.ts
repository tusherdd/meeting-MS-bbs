import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import { Designation } from '../designations/entities/designation.entity';
import { OfficeReportScope } from '../designations/enums/office-report-scope.enum';
import { User } from '../users/entities/user.entity';
import { resolveScope } from './office-scope.rules';

export interface OfficeAccess {
  scope: OfficeReportScope;
  /** The viewer's own wing (WING scope uses it; null = no wing). */
  wing: { id: string; nameBn: string; nameEn: string } | null;
}

/**
 * v1.15 (SPEC.md §6.10): the viewer's office report scope, and read-only access of report viewers
 * to meetings in their scope (meeting detail, notice, minutes). Used by reports, meetings,
 * notices, decisions and /auth/me.
 */
@Injectable()
export class OfficeScopeService {
  constructor(private readonly dataSource: DataSource) {}

  async access(actor: Pick<AuthUser, 'id'>): Promise<OfficeAccess> {
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: actor.id },
      relations: { designation: true, wing: true, additionalCharges: true },
    });
    if (!user) return { scope: OfficeReportScope.NONE, wing: null };
    const charges = (user.additionalCharges ?? []).map((c) => c.description);
    const designations =
      charges.length > 0
        ? await this.dataSource.getRepository(Designation).find({
            select: {
              id: true,
              nameBn: true,
              nameEn: true,
              officeReportScope: true,
            },
          })
        : [];
    const scope = resolveScope({
      role: user.role,
      designationScope: user.designation?.officeReportScope ?? null,
      charges,
      designations,
    });
    return {
      scope,
      wing: user.wing
        ? {
            id: user.wing.id,
            nameBn: user.wing.nameBn,
            nameEn: user.wing.nameEn,
          }
        : null,
    };
  }

  /**
   * May a report viewer open this meeting read-only? OFFICE: every meeting. WING: meetings
   * organized by an officer of their wing, or with any officer of their wing among its people.
   */
  async canViewMeeting(
    actor: Pick<AuthUser, 'id'>,
    meetingId: string,
    known?: OfficeAccess,
  ): Promise<boolean> {
    const access = known ?? (await this.access(actor));
    if (access.scope === OfficeReportScope.OFFICE) return true;
    if (access.scope !== OfficeReportScope.WING || !access.wing) return false;
    const rows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok FROM meetings m
       JOIN users o ON o.id = m."organizerId"
       WHERE m.id = $1 AND (
         o."wingId" = $2 OR EXISTS (
           SELECT 1 FROM meeting_participants mp JOIN users u ON u.id = mp."userId"
           WHERE mp."meetingId" = m.id AND u."wingId" = $2))
       LIMIT 1`,
      [meetingId, access.wing.id],
    );
    return rows.length > 0;
  }
}
