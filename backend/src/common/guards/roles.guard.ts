import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_MESSAGES } from '../../modules/auth/auth.messages';
import { UserRole } from '../../modules/users/enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AppRequest } from '../types/auth-user';

/** Global guard (runs after JwtAuthGuard). Routes without @Roles() are open to any user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;

    const user = context.switchToHttp().getRequest<AppRequest>().user;
    if (!user) throw new ForbiddenException(AUTH_MESSAGES.forbiddenRole);
    // SPEC.md §5: SUPER_ADMIN can do everything.
    if (user.role === UserRole.SUPER_ADMIN || roles.includes(user.role)) {
      return true;
    }
    throw new ForbiddenException(AUTH_MESSAGES.forbiddenRole);
  }
}
