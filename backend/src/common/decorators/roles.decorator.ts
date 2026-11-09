import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../modules/users/enums/user-role.enum';

export const ROLES_KEY = 'roles';

/** Restricts a route to these roles. SUPER_ADMIN always passes (SPEC.md §5). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
