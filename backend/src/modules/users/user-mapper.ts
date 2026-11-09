/**
 * Shared user mapping (admin users API and own profile). Explicit field lists: nothing else —
 * no password or token hashes — ever leaves the API.
 */
import type { EntityManager } from 'typeorm';
import type { UserDetailDto, UserSummaryDto } from './dto/user-response.dto';
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
    additionalCharges: (u.additionalCharges ?? []).map((c) => ({
      id: c.id,
      description: c.description,
    })),
    updatedAt: u.updatedAt,
  };
}

/** Replaces a user's additional charges with `descriptions` (inside the caller's transaction). */
export async function replaceAdditionalCharges(
  manager: EntityManager,
  userId: string,
  descriptions: string[],
): Promise<void> {
  const repo = manager.getRepository(UserAdditionalCharge);
  await repo.delete({ userId });
  if (descriptions.length > 0) {
    await repo.insert(
      descriptions.map((description) => ({ userId, description })),
    );
  }
}
