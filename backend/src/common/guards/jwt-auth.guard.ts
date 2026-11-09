import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnvVars } from '../../config/env.validation';
import { ACCESS_TOKEN_COOKIE } from '../../modules/auth/auth.constants';
import { AUTH_MESSAGES } from '../../modules/auth/auth.messages';
import { User } from '../../modules/users/entities/user.entity';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../decorators/allow-pending-password-change.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AppRequest } from '../types/auth-user';

export interface AccessTokenPayload {
  sub: string;
  typ: 'access';
}

/** Bearer header wins over the cookie (Swagger uses the header). */
export function extractAccessToken(req: AppRequest): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || undefined;
  return req.cookies?.[ACCESS_TOKEN_COOKIE] || undefined;
}

/**
 * Global guard: every route needs a valid access token unless marked @Public().
 * The user is re-loaded from the DB on each request, so deactivation and role changes apply
 * immediately. While mustChangePassword is true only @AllowPendingPasswordChange() routes work.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly secret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
    config: ConfigService<EnvVars, true>,
  ) {
    this.secret = config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AppRequest>();
    const token = extractAccessToken(req);
    if (!token) throw new UnauthorizedException(AUTH_MESSAGES.loginRequired);

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.secret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException(AUTH_MESSAGES.sessionExpired);
    }
    if (payload.typ !== 'access' || typeof payload.sub !== 'string') {
      throw new UnauthorizedException(AUTH_MESSAGES.sessionExpired);
    }

    const user = await this.users.findOne({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(AUTH_MESSAGES.sessionExpired);
    }

    req.user = {
      id: user.id,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };

    const allowPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_CHANGE_KEY,
      targets,
    );
    if (user.mustChangePassword && !allowPending) {
      throw new ForbiddenException(AUTH_MESSAGES.mustChangePassword);
    }
    return true;
  }
}
