/**
 * Shared user mapping (admin users API and own profile). Explicit field lists: nothing else —
 * no password or token hashes — ever leaves the API.
 */
import type { EntityManager } from 'typeorm';
import type {
  AdditionalChargeDto,
  UserDetailDto,
  UserSummaryDto,
} from './dto/user-response.dto';
import { UserAdditionalCharge } from './entities/user-additional-charge.entity';
import type { User } from './entities/user.entity';

/** Explicit mapping: only these fields ever leave the API (no hashes, no tokens). */
export function toUserSummary(u: User): UserSummaryDto {
  return {
    id: u.id,
    loginEmail: u.loginEmail,
    notificationEmail: u.notificationEmail,
    nameBn: u.nameBn,
    nameEn: u.nameEn,
    mobile: u.mobile,
    designation: u.designation
      ? {
          id: u.designation.id,
          nameBn: u.designation.nameBn,
          nameEn: u.designation.nameEn,
          priority: u.designation.priority,
        }
      : null,
    designationRemark: u.designationRemark,
    wing: u.wing
      ? { id: u.wing.id, nameBn: u.wing.nameBn, nameEn: u.wing.nameEn }
      : null,
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    passwordIsDefault: u.passwordIsDefault,
    chargesNeedReview:
      (u.reviewChargeCount ??
        (u.additionalCharges ?? []).filter((c) => c.needsReview).length) > 0,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export function toUserDetail(u: User): UserDetailDto {
  return {
    ...toUserSummary(u),
    pendingNotificationEmail: u.pendingNotificationEmail,
    mobileAlt: u.mobileAlt,
    officePhone: u.officePhone,
    fax: u.fax,
    photoPath: u.photoPath,
    organizationBn: u.organizationBn,
    organizationEn: u.organizationEn,
    bcsBatch: u.bcsBatch,
    failedLoginCount: u.failedLoginCount,
    additionalCharges: (u.additionalCharges ?? []).map(toChargeDto),
    updatedAt: u.updatedAt,
  };
}

const ref = (r: { id: string; nameBn: string; nameEn: string } | null) =>
  r ? { id: r.id, nameBn: r.nameBn, nameEn: r.nameEn } : null;

export function toChargeDto(c: UserAdditionalCharge): AdditionalChargeDto {
  return {
    id: c.id,
    designation: ref(c.designation ?? null),
    wing: ref(c.wing ?? null),
    note: c.note,
    needsReview: c.needsReview,
  };
}

/** v1.16: what an additional charge stores (also the audit snapshot). */
export interface ChargeValue {
  designationId: string;
  wingId: string | null;
  note: string | null;
}

/** Same list (order and values)? Used to skip writes and audit entries when nothing changed. */
export function sameCharges(
  current: readonly UserAdditionalCharge[],
  next: readonly ChargeValue[],
): boolean {
  return (
    current.length === next.length &&
    current.every(
      (c, i) =>
        !c.needsReview &&
        c.designationId === next[i].designationId &&
        (c.wingId ?? null) === next[i].wingId &&
        (c.note ?? null) === next[i].note,
    )
  );
}

/** Replaces a user's additional charges (inside the caller's transaction). */
export async function replaceAdditionalCharges(
  manager: EntityManager,
  userId: string,
  charges: readonly ChargeValue[],
): Promise<void> {
  const repo = manager.getRepository(UserAdditionalCharge);
  await repo.delete({ userId });
  if (charges.length > 0) {
    await repo.insert(
      charges.map((c) => ({ userId, ...c, needsReview: false })),
    );
  }
}
