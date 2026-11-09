import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { EnvVars } from '../../config/env.validation';
import {
  checkPasswordStrength,
  hashPassword,
  verifyPassword,
} from '../../common/utils/password';
import { generateSecureToken, sha256Hex } from '../../common/utils/token';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { passwordResetMail } from '../mail/templates/mail-templates';
import { ChannelName } from '../notifications/channels/notification-channel';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { RESET_TOKEN_TTL_MINUTES } from './auth.constants';
import { AUTH_MESSAGES } from './auth.messages';
import type { MeResponseDto } from './dto/auth-responses.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { PasswordTokenPurpose } from './enums/password-token-purpose.enum';
import { LoginAttemptService } from './login-attempt.service';
import { issuePasswordToken } from './password-tokens';
import {
  TokenService,
  type RequestMeta,
  type TokenPair,
} from './token.service';

@Injectable()
export class AuthService {
  private readonly frontendUrl: string;
  /** Hash used to spend the same time on unknown emails as on real ones. */
  private dummyHash?: Promise<string>;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tokens: TokenService,
    private readonly attempts: LoginAttemptService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly dataSource: DataSource,
    config: ConfigService<EnvVars, true>,
  ) {
    this.frontendUrl = config
      .get('FRONTEND_URL', { infer: true })
      .replace(/\/+$/, '');
  }

  // ---------------------------------------------------------------- login / session

  async login(
    dto: LoginDto,
    meta: RequestMeta,
  ): Promise<{ pair: TokenPair; user: MeResponseDto }> {
    const user = await this.users.findOne({
      where: { loginEmail: dto.loginEmail },
      select: {
        id: true,
        passwordHash: true,
        isActive: true,
        failedLoginCount: true,
      },
    });

    // No account lock (owner decision): a progressive delay instead, applied BEFORE the
    // password is checked — so even a correct password waits, and known and unknown emails
    // follow the same timing pattern.
    await this.attempts.waitBeforeAnswer(
      user
        ? user.failedLoginCount
        : this.attempts.unknownEmailFailures(dto.loginEmail),
    );

    if (!user) {
      await this.safeVerify(await this.getDummyHash(), dto.password);
      const failedCount = this.attempts.registerUnknownEmailFailure(
        dto.loginEmail,
      );
      // The attempted email is NOT stored: people sometimes type their password into it.
      await this.auditLoginFailure(null, 'unknown_email', meta, failedCount);
      throw new UnauthorizedException(AUTH_MESSAGES.invalidCredentials);
    }

    if (!(await this.safeVerify(user.passwordHash, dto.password))) {
      const failedCount = await this.attempts.registerFailure(user.id);
      await this.auditLoginFailure(
        user.id,
        'wrong_password',
        meta,
        failedCount,
      );
      throw new UnauthorizedException(AUTH_MESSAGES.invalidCredentials);
    }

    // Only revealed after a correct password, so it does not leak which accounts exist.
    if (!user.isActive) {
      await this.auditLoginFailure(user.id, 'inactive', meta);
      throw new ForbiddenException(AUTH_MESSAGES.accountInactive);
    }

    await this.attempts.registerSuccess(user.id);
    const pair = await this.tokens.issuePair(user.id, meta);
    await this.audit.log({
      actorId: user.id,
      action: AuditAction.LOGIN_SUCCESS,
      entityType: 'user',
      entityId: user.id,
      ip: meta.ip,
    });
    return { pair, user: await this.getMe(user.id) };
  }

  async refresh(
    rawRefreshToken: string | undefined,
    meta: RequestMeta,
  ): Promise<TokenPair> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException(AUTH_MESSAGES.sessionExpired);
    }
    return this.tokens.rotate(rawRefreshToken, meta);
  }

  async logout(
    userId: string,
    rawRefreshToken: string | undefined,
  ): Promise<void> {
    if (rawRefreshToken) await this.tokens.revoke(rawRefreshToken, userId);
  }

  async getMe(userId: string): Promise<MeResponseDto> {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: { designation: true, wing: true },
    });
    if (!user) throw new UnauthorizedException(AUTH_MESSAGES.sessionExpired);

    // Explicit mapping: only these fields ever leave the API (never passwordHash / token hashes).
    return {
      id: user.id,
      loginEmail: user.loginEmail,
      notificationEmail: user.notificationEmail,
      nameBn: user.nameBn,
      nameEn: user.nameEn,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      designation: user.designation
        ? {
            id: user.designation.id,
            nameBn: user.designation.nameBn,
            nameEn: user.designation.nameEn,
            priority: user.designation.priority,
          }
        : null,
      wing: user.wing
        ? {
            id: user.wing.id,
            nameBn: user.wing.nameBn,
            nameEn: user.wing.nameEn,
          }
        : null,
      priority: user.designation?.priority ?? null,
      lastLoginAt: user.lastLoginAt,
    };
  }

  // ---------------------------------------------------------------- passwords

  /** Changes the password, ends all other sessions and returns a fresh pair for this device. */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    meta: RequestMeta,
  ): Promise<TokenPair> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, loginEmail: true, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException(AUTH_MESSAGES.sessionExpired);

    if (!(await this.safeVerify(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException(AUTH_MESSAGES.wrongCurrentPassword);
    }
    const problems = checkPasswordStrength(dto.newPassword, user.loginEmail);
    if (dto.newPassword === dto.currentPassword) {
      problems.push(AUTH_MESSAGES.samePassword);
    }
    if (problems.length > 0) throw new BadRequestException(problems);

    const passwordHash = await hashPassword(dto.newPassword);
    return this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(User)
        .update(user.id, { passwordHash, mustChangePassword: false });
      await this.tokens.revokeAllForUser(user.id, manager);
      const pair = await this.tokens.issuePair(user.id, meta, manager);
      await this.audit.log(
        {
          actorId: user.id,
          action: AuditAction.PASSWORD_CHANGE,
          entityType: 'user',
          entityId: user.id,
          ip: meta.ip,
        },
        manager,
      );
      return pair;
    });
  }

  /**
   * Queues a reset mail for an active account. Always returns normally, so the response
   * never reveals whether the email is registered.
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.users.findOne({
      where: { loginEmail: dto.loginEmail },
      select: { id: true, isActive: true },
    });
    if (!user?.isActive) return;

    await this.dataSource.transaction(async (manager) => {
      const rawToken = await issuePasswordToken(
        manager,
        user.id,
        PasswordTokenPurpose.RESET,
        RESET_TOKEN_TTL_MINUTES * 60_000,
      );
      const link = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
      await this.notifications.notify(
        [user.id],
        {
          type: NotificationType.PASSWORD_RESET_LINK,
          title: 'পাসওয়ার্ড রিসেট',
          body: 'পাসওয়ার্ড রিসেটের লিংক পাঠানো হয়েছে।',
          email: (r) =>
            passwordResetMail({
              nameBn: r.nameBn,
              link,
              validMinutes: RESET_TOKEN_TTL_MINUTES,
            }),
        },
        [ChannelName.EMAIL], // a security mail, not a bell item
        manager,
      );
      await this.audit.log(
        {
          actorId: user.id,
          action: AuditAction.PASSWORD_RESET_REQUEST,
          entityType: 'user',
          entityId: user.id,
          ip: meta.ip,
        },
        manager,
      );
    });
  }

  /**
   * Sets a password from a one-time link: "forgot password", admin reset (RESET) or the first
   * password of a new account (SET_INITIAL). Single use; ends all sessions. Returns the
   * purpose so the response text can match.
   */
  async resetPassword(
    dto: ResetPasswordDto,
    meta: RequestMeta,
  ): Promise<PasswordTokenPurpose> {
    const tokenHash = sha256Hex(dto.token);

    const purpose = await this.dataSource.transaction(async (manager) => {
      const resetTokens = manager.getRepository(PasswordResetToken);
      const row = await resetTokens
        .createQueryBuilder('t')
        .where('t.tokenHash = :tokenHash', { tokenHash })
        .setLock('pessimistic_write')
        .getOne();
      if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now())
        return null;

      const user = await manager.getRepository(User).findOne({
        where: { id: row.userId },
        select: { id: true, loginEmail: true, isActive: true },
      });
      if (!user?.isActive) return null;

      // Throwing here rolls back, so the link stays usable for a second, valid try.
      const problems = checkPasswordStrength(dto.newPassword, user.loginEmail);
      if (problems.length > 0) throw new BadRequestException(problems);

      await manager.getRepository(User).update(user.id, {
        passwordHash: await hashPassword(dto.newPassword),
        mustChangePassword: false, // the user chose this password themselves
        failedLoginCount: 0,
      });
      await resetTokens.update(
        { userId: user.id, usedAt: IsNull() },
        { usedAt: new Date() },
      );
      await this.tokens.revokeAllForUser(user.id, manager);
      await this.audit.log(
        {
          actorId: user.id,
          action: AuditAction.PASSWORD_RESET,
          entityType: 'user',
          entityId: user.id,
          after: { purpose: row.purpose },
          ip: meta.ip,
        },
        manager,
      );
      return row.purpose;
    });

    if (!purpose)
      throw new BadRequestException(AUTH_MESSAGES.invalidResetToken);
    return purpose;
  }

  // ---------------------------------------------------------------- helpers

  private auditLoginFailure(
    userId: string | null,
    reason: 'unknown_email' | 'wrong_password' | 'inactive',
    meta: RequestMeta,
    failedCount?: number,
  ): Promise<void> {
    return this.audit.log({
      actorId: userId,
      action: AuditAction.LOGIN_FAILED,
      entityType: 'user',
      entityId: userId,
      after: failedCount === undefined ? { reason } : { reason, failedCount },
      ip: meta.ip,
    });
  }

  /** argon2.verify throws on a malformed hash; treat that as "wrong password". */
  private async safeVerify(hash: string, password: string): Promise<boolean> {
    try {
      return await verifyPassword(hash, password);
    } catch {
      return false;
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword(generateSecureToken());
    return this.dummyHash;
  }
}
