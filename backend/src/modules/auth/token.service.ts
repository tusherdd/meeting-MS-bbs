import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { EnvVars } from '../../config/env.validation';
import type { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { parseDurationToSeconds } from '../../common/utils/duration';
import { hashesEqual, sha256Hex } from '../../common/utils/token';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { User } from '../users/entities/user.entity';
import { AUTH_MESSAGES } from './auth.messages';
import { RefreshToken } from './entities/refresh-token.entity';

export interface RefreshTokenPayload {
  sub: string;
  /** = refresh_tokens.id */
  jti: string;
  typ: 'refresh';
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface TokenPair {
  accessToken: string;
  accessExpiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
}

type RotationOutcome =
  { kind: 'ok'; pair: TokenPair } | { kind: 'invalid' } | { kind: 'reuse' };

/**
 * Access + refresh tokens (SPEC.md §9.3).
 * - Access: JWT, 15 min, never stored.
 * - Refresh: JWT, 7 days; only its SHA-256 hash is stored (row id = jti).
 * - Rotation: every refresh revokes the used token and links it to its replacement.
 * - Reuse detection: presenting an already revoked token revokes ALL of that user's tokens.
 */
@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    config: ConfigService<EnvVars, true>,
  ) {
    this.accessSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
    this.refreshSecret = config.get('JWT_REFRESH_SECRET', { infer: true });
    this.accessTtlSeconds = parseDurationToSeconds(
      config.get('JWT_ACCESS_TTL', { infer: true }),
    );
    this.refreshTtlSeconds = parseDurationToSeconds(
      config.get('JWT_REFRESH_TTL', { infer: true }),
    );
  }

  /** Issues a new access + refresh pair and stores the refresh token hash. */
  async issuePair(
    userId: string,
    meta: RequestMeta,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<TokenPair> {
    const { pair } = await this.createPair(userId, meta, manager);
    return pair;
  }

  private async createPair(
    userId: string,
    meta: RequestMeta,
    manager: EntityManager,
  ): Promise<{ pair: TokenPair; refreshTokenId: string }> {
    const refreshTokenId = randomUUID();
    const accessPayload: AccessTokenPayload = { sub: userId, typ: 'access' };
    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      jti: refreshTokenId,
      typ: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.accessSecret,
        expiresIn: this.accessTtlSeconds,
        algorithm: 'HS256',
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        expiresIn: this.refreshTtlSeconds,
        algorithm: 'HS256',
      }),
    ]);

    await manager.getRepository(RefreshToken).insert({
      id: refreshTokenId,
      userId,
      tokenHash: sha256Hex(refreshToken),
      expiresAt: new Date(Date.now() + this.refreshTtlSeconds * 1000),
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
      ip: meta.ip?.slice(0, 45) ?? null,
    });

    return {
      pair: {
        accessToken,
        accessExpiresIn: this.accessTtlSeconds,
        refreshToken,
        refreshExpiresIn: this.refreshTtlSeconds,
      },
      refreshTokenId,
    };
  }

  /** Exchanges a refresh token for a new pair. Throws 401 on any problem. */
  async rotate(rawRefreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    const payload = await this.verifyRefreshToken(rawRefreshToken);
    if (!payload) throw new UnauthorizedException(AUTH_MESSAGES.sessionExpired);

    const outcome = await this.dataSource.transaction(
      async (manager): Promise<RotationOutcome> => {
        // Row lock: two parallel refreshes with the same token cannot both succeed.
        const row = await manager
          .getRepository(RefreshToken)
          .createQueryBuilder('t')
          .addSelect('t.tokenHash')
          .where('t.id = :id', { id: payload.jti })
          .setLock('pessimistic_write')
          .getOne();

        if (
          !row ||
          row.userId !== payload.sub ||
          !hashesEqual(row.tokenHash, sha256Hex(rawRefreshToken))
        ) {
          return { kind: 'invalid' };
        }

        if (row.revokedAt && row.replacedById) {
          // Reuse: this token was already exchanged for a newer one, so someone else holds a
          // copy. Assume it was stolen and end every session of the user.
          await this.revokeAllForUser(row.userId, manager);
          await this.audit.log(
            {
              actorId: row.userId,
              action: AuditAction.REFRESH_TOKEN_REUSE,
              entityType: 'refresh_token',
              entityId: row.id,
              ip: meta.ip,
            },
            manager,
          );
          return { kind: 'reuse' };
        }

        // Revoked for another reason (logout, password change, earlier reuse) → just invalid.
        if (row.revokedAt) return { kind: 'invalid' };
        if (row.expiresAt.getTime() <= Date.now()) return { kind: 'invalid' };

        const user = await manager.getRepository(User).findOne({
          where: { id: row.userId },
          select: { id: true, isActive: true },
        });
        if (!user?.isActive) {
          await manager
            .getRepository(RefreshToken)
            .update(row.id, { revokedAt: new Date() });
          return { kind: 'invalid' };
        }

        const { pair, refreshTokenId } = await this.createPair(
          row.userId,
          meta,
          manager,
        );
        await manager.getRepository(RefreshToken).update(row.id, {
          revokedAt: new Date(),
          replacedById: refreshTokenId,
        });
        return { kind: 'ok', pair };
      },
    );

    // Thrown after the transaction so the "revoke all" of a reuse is committed, not rolled back.
    if (outcome.kind !== 'ok') {
      throw new UnauthorizedException(AUTH_MESSAGES.sessionExpired);
    }
    return outcome.pair;
  }

  /** Logout: revokes one refresh token if it is valid and belongs to `userId`. */
  async revoke(rawRefreshToken: string, userId: string): Promise<void> {
    const payload = await this.verifyRefreshToken(rawRefreshToken);
    if (!payload || payload.sub !== userId) return;
    await this.dataSource.getRepository(RefreshToken).update(
      {
        id: payload.jti,
        userId,
        tokenHash: sha256Hex(rawRefreshToken),
        revokedAt: IsNull(),
      },
      { revokedAt: new Date() },
    );
  }

  /** Ends every session of a user (password change/reset, token reuse). */
  async revokeAllForUser(
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    await manager
      .getRepository(RefreshToken)
      .update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async verifyRefreshToken(
    raw: string,
  ): Promise<RefreshTokenPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(raw, {
        secret: this.refreshSecret,
        algorithms: ['HS256'],
      });
      if (
        payload.typ !== 'refresh' ||
        typeof payload.sub !== 'string' ||
        typeof payload.jti !== 'string'
      ) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }
}
