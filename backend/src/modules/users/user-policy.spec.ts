import { ForbiddenException } from '@nestjs/common';
import { UserRole } from './enums/user-role.enum';
import { assertCanManage, type UserManageAction } from './user-policy';
import { USER_MESSAGES } from './users.messages';

const superAdmin = { id: 'sa', role: UserRole.SUPER_ADMIN };
const admin = { id: 'a1', role: UserRole.ADMIN };
const otherAdmin = { id: 'a2', role: UserRole.ADMIN };
const officer = { id: 'o1', role: UserRole.OFFICER };

function expectForbidden(fn: () => void, message: string): void {
  expect(fn).toThrow(new ForbiddenException(message));
}

describe('assertCanManage', () => {
  describe('SUPER_ADMIN account', () => {
    it.each<UserManageAction>(['update', 'resetPassword', 'status', 'role'])(
      'an ADMIN cannot %s the SUPER_ADMIN',
      (action) => {
        expect(() => assertCanManage(admin, superAdmin, action)).toThrow(
          ForbiddenException,
        );
      },
    );

    it.each<UserManageAction>(['update', 'resetPassword'])(
      'the SUPER_ADMIN can %s their own account',
      (action) => {
        expect(() =>
          assertCanManage(superAdmin, superAdmin, action),
        ).not.toThrow();
      },
    );

    it.each<UserManageAction>(['status', 'role'])(
      'even the SUPER_ADMIN cannot change their own %s',
      (action) => {
        expectForbidden(
          () =>
            assertCanManage(superAdmin, superAdmin, action, {
              deactivate: true,
            }),
          USER_MESSAGES.superAdminStatusRole,
        );
      },
    );
  });

  describe('self-protection', () => {
    it('an admin cannot deactivate themselves', () => {
      expectForbidden(
        () => assertCanManage(admin, admin, 'status', { deactivate: true }),
        USER_MESSAGES.selfDeactivate,
      );
    });

    it('an admin cannot change their own role', () => {
      expectForbidden(
        () => assertCanManage(admin, admin, 'role'),
        USER_MESSAGES.selfRoleChange,
      );
    });

    it('an admin may edit and reset their own account', () => {
      expect(() => assertCanManage(admin, admin, 'update')).not.toThrow();
      expect(() =>
        assertCanManage(admin, admin, 'resetPassword'),
      ).not.toThrow();
    });
  });

  describe('normal management', () => {
    it.each<UserManageAction>(['update', 'resetPassword', 'status', 'role'])(
      'an admin can %s an officer and another admin',
      (action) => {
        expect(() =>
          assertCanManage(admin, officer, action, { deactivate: true }),
        ).not.toThrow();
        expect(() =>
          assertCanManage(admin, otherAdmin, action, { deactivate: true }),
        ).not.toThrow();
      },
    );

    it('the SUPER_ADMIN can manage everyone else', () => {
      expect(() => assertCanManage(superAdmin, admin, 'role')).not.toThrow();
      expect(() =>
        assertCanManage(superAdmin, officer, 'status', { deactivate: true }),
      ).not.toThrow();
    });
  });
});
