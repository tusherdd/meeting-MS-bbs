import { ForbiddenException } from '@nestjs/common';
import { UserRole } from './enums/user-role.enum';
import { USER_MESSAGES } from './users.messages';

export type UserManageAction = 'update' | 'status' | 'role' | 'resetPassword';

interface Party {
  id: string;
  role: UserRole;
}

/**
 * Who may manage whom (SPEC.md §5, step 5). Callers are already ADMIN/SUPER_ADMIN (route
 * guard); this adds the account-level rules. Throws 403 with a Bangla message.
 *
 * 1. SUPER_ADMIN account:
 *    - status and role can never be changed, by anyone (also not by the SUPER_ADMIN);
 *    - update and password reset only by the SUPER_ADMIN on their own account.
 * 2. Nobody may change their own role, or deactivate themselves.
 */
export function assertCanManage(
  actor: Party,
  target: Party,
  action: UserManageAction,
  options: { deactivate?: boolean } = {},
): void {
  const self = actor.id === target.id;

  if (target.role === UserRole.SUPER_ADMIN) {
    if (action === 'status' || action === 'role') {
      throw new ForbiddenException(USER_MESSAGES.superAdminStatusRole);
    }
    if (!self) throw new ForbiddenException(USER_MESSAGES.superAdminProtected);
  }

  if (self && action === 'role') {
    throw new ForbiddenException(USER_MESSAGES.selfRoleChange);
  }
  if (self && action === 'status' && options.deactivate) {
    throw new ForbiddenException(USER_MESSAGES.selfDeactivate);
  }
}
