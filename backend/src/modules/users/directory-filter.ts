import { Brackets, type SelectQueryBuilder } from 'typeorm';
import type { User } from './entities/user.entity';

export interface DirectoryGroupFilter {
  wingId?: string;
  designationId?: string;
}

/**
 * Wing / designation filter of GET /users/directory (v1.20 group add, SPEC.md §13.6).
 * - wing only        → main wing (unchanged since step 5);
 * - designation only → main designation, OR a structured additional charge with that designation
 *                      (any wing); officers without a main designation can never be invited, so
 *                      they are left out;
 * - both             → (main designation AND main wing) OR a charge with that designation whose
 *                      wing — the officer's own wing when the charge has none — is that wing.
 * The charge check is a correlated EXISTS on user_additional_charges, so the page stays ONE query
 * (no join fan-out, no N+1). Expects the user alias `u`.
 */
export function applyDirectoryGroupFilter(
  qb: SelectQueryBuilder<User>,
  { wingId, designationId }: DirectoryGroupFilter,
): void {
  if (!designationId) {
    if (wingId) qb.andWhere('u.wingId = :wingId', { wingId });
    return;
  }

  qb.andWhere('u.designationId IS NOT NULL');
  const chargeWing = wingId
    ? ' AND COALESCE(c."wingId", u."wingId") = :wingId'
    : '';
  const charge =
    'EXISTS (SELECT 1 FROM user_additional_charges c ' +
    'WHERE c."userId" = u.id AND c."designationId" = :designationId' +
    chargeWing +
    ')';
  qb.andWhere(
    new Brackets((b) => {
      if (wingId) {
        b.where(
          new Brackets((m) =>
            m
              .where('u.designationId = :designationId')
              .andWhere('u.wingId = :wingId'),
          ),
        ).orWhere(charge);
      } else {
        b.where('u.designationId = :designationId').orWhere(charge);
      }
    }),
    wingId ? { designationId, wingId } : { designationId },
  );
}
