import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { AppRequest, AuthUser } from '../types/auth-user';

/** Injects the logged-in user (set by JwtAuthGuard). Use only on non-public routes. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const user = ctx.switchToHttp().getRequest<AppRequest>().user;
    if (!user) throw new UnauthorizedException();
    return user;
  },
);
