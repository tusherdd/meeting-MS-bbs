import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';
import type { UserRole } from '../../modules/users/enums/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to these roles. SUPER_ADMIN always passes (SPEC.md §5). Also writes
 * `x-access` (e.g. "ADMIN") into the OpenAPI document (used by docs/API.md).
 */
export const Roles = (...roles: UserRole[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    ApiExtension('x-access', roles.join(',')),
  );
