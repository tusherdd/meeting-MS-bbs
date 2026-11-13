import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload } from '../guards/jwt-auth.guard';
import { extractAccessToken } from '../guards/jwt-auth.guard';
import type { AppRequest } from '../types/auth-user';

export const THROTTLE_BY_IP_KEY = 'throttleByIp';

/**
 * Keep this route's rate limit per client IP, even for logged-in users (login, password
 * routes: they protect against guessing from one place, SPEC.md §9.2/§9.7).
 */
export const ThrottleByIp = () => SetMetadata(THROTTLE_BY_IP_KEY, true);

export interface ThrottleLimits {
  /** Requests per minute per client IP (requests without a valid access token). */
  perIp: number;
  /** Requests per minute per logged-in user. */
  perUser: number;
}

export interface RequestIdentity {
  kind: 'user' | 'ip';
  /** Storage key part: "user:<uuid>" or "ip:<address>". */
  tracker: string;
}

/**
 * Who a request is counted against by the global throttler (SPEC.md §9.7):
 * - a request with a valid access token (cookie or Bearer) → its user id, so officers behind one
 *   office NAT do not share one budget;
 * - everything else, and routes marked @ThrottleByIp() → the client IP (TRUST_PROXY decides
 *   which address that is behind nginx).
 *
 * Only the token's signature and expiry are checked here (no database query, the throttler runs
 * before JwtAuthGuard). A forged token fails the signature check and is counted per IP. The
 * result is cached per request, because the limit and the tracker both need it.
 */
export class ThrottleIdentity {
  private readonly cache = new WeakMap<object, RequestIdentity>();
  private readonly jwt = new JwtService({});
  private readonly reflector = new Reflector();

  constructor(
    private readonly accessSecret: string,
    private readonly limits: ThrottleLimits,
  ) {}

  identify(req: AppRequest, context?: ExecutionContext): RequestIdentity {
    const cached = this.cache.get(req);
    if (cached) return cached;
    const identity = this.compute(req, context);
    this.cache.set(req, identity);
    return identity;
  }

  /** Default limit of the global throttler for this request (routes may set their own). */
  limitFor(context: ExecutionContext): number {
    const req = context.switchToHttp().getRequest<AppRequest>();
    return this.identify(req, context).kind === 'user'
      ? this.limits.perUser
      : this.limits.perIp;
  }

  trackerFor(req: AppRequest, context: ExecutionContext): string {
    return this.identify(req, context).tracker;
  }

  private compute(
    req: AppRequest,
    context?: ExecutionContext,
  ): RequestIdentity {
    const byIp =
      !!context &&
      this.reflector.getAllAndOverride<boolean>(THROTTLE_BY_IP_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    if (!byIp) {
      const userId = this.userIdFromToken(req);
      if (userId) return { kind: 'user', tracker: `user:${userId}` };
    }
    return { kind: 'ip', tracker: `ip:${req.ip ?? 'unknown'}` };
  }

  private userIdFromToken(req: AppRequest): string | null {
    const token = extractAccessToken(req);
    if (!token) return null;
    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.accessSecret,
        algorithms: ['HS256'],
      });
      return payload.typ === 'access' && typeof payload.sub === 'string'
        ? payload.sub
        : null;
    } catch {
      return null; // expired or forged: counted per IP
    }
  }
}
