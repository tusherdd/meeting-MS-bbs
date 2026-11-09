import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvVars } from '../../config/env.validation';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../../modules/auth/auth.constants';
import { AUTH_MESSAGES } from '../../modules/auth/auth.messages';
import type { AppRequest } from '../types/auth-user';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection (SPEC.md §9.5). Browsers attach cookies automatically, so a cookie-
 * authenticated state-changing request must come from an allowed origin: the frontend
 * (CORS_ORIGINS) or the API itself (APP_URL — Swagger UI). Requests with a Bearer header are
 * not CSRF-able (a foreign site cannot set that header), so they are not checked.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: ReadonlySet<string>;

  constructor(config: ConfigService<EnvVars, true>) {
    this.allowed = new Set([
      ...config.get('CORS_ORIGINS', { infer: true }),
      new URL(config.get('APP_URL', { infer: true })).origin,
    ]);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (req.headers.authorization?.startsWith('Bearer ')) return true;

    const usesCookies =
      Boolean(req.cookies?.[ACCESS_TOKEN_COOKIE]) ||
      Boolean(req.cookies?.[REFRESH_TOKEN_COOKIE]);
    if (!usesCookies) return true;

    const origin = req.headers.origin;
    if (origin && this.allowed.has(origin)) return true;
    throw new ForbiddenException(AUTH_MESSAGES.badOrigin);
  }
}
