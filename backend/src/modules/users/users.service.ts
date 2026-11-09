import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  EntityManager,
  Not,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import {
  paginated,
  type PaginatedResponseDto,
} from '../../common/dto/paginated-response.dto';
import type { AuthUser } from '../../common/types/auth-user';
import { pickChanges } from '../../common/utils/changes';
import { isUniqueViolation } from '../../common/utils/db-errors';
import { toAsciiDigits } from '../../common/utils/digits';
import { hashUnusablePassword } from '../../common/utils/password';
import { escapeLike } from '../../common/utils/sql';
import { EnvVars } from '../../config/env.validation';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import {
  ADMIN_RESET_TOKEN_TTL_HOURS,
  SET_INITIAL_TOKEN_TTL_HOURS,
} from '../auth/auth.constants';
import { PasswordTokenPurpose } from '../auth/enums/password-token-purpose.enum';
import { issuePasswordToken } from '../auth/password-tokens';
import { TokenService } from '../auth/token.service';
import { Designation } from '../designations/entities/designation.entity';
import {
  adminResetMail,
  setPasswordMail,
} from '../mail/templates/mail-templates';
import { ChannelName } from '../notifications/channels/notification-channel';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Wing } from '../wings/entities/wing.entity';
import type { CreateUserDto } from './dto/create-user.dto';
import type {
  UpdateUserDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/update-user.dto';
import {
  UserSortField,
  type DirectoryQueryDto,
  type UsersQueryDto,
} from './dto/user-query.dto';
import type {
  DirectoryEntryDto,
  UserDetailDto,
  UserSummaryDto,
} from './dto/user-response.dto';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import {
  replaceAdditionalCharges,
  toUserDetail,
  toUserSummary,
} from './user-mapper';
import { assertCanManage } from './user-policy';
import { USER_MESSAGES } from './users.messages';

const LOGIN_EMAIL_INDEX = 'UQ_users_loginEmail';

/** Columns an admin may change through PATCH /users/:id (not role/status/password). */
const EDITABLE_FIELDS = [
  'loginEmail',
  'notificationEmail',
  'nameBn',
  'nameEn',
  'designationId',
  'designationRemark',
  'wingId',
  'mobile',
  'mobileAlt',
  'officePhone',
  'fax',
  'organizationBn',
  'organizationEn',
  'bcsBatch',
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

/** NOT NULL columns: sending null for them is a validation error. */
const REQUIRED_FIELDS: Partial<Record<EditableField, string>> = {
  loginEmail: 'লগইন ইমেইল',
  notificationEmail: 'নোটিফিকেশন ইমেইল',
  nameBn: 'বাংলা নাম',
  nameEn: 'ইংরেজি নাম',
  designationId: 'পদবি',
};

const SORT_COLUMNS: Record<UserSortField, string> = {
  [UserSortField.PRIORITY]: 'd.priority',
  [UserSortField.NAME_EN]: 'u.nameEn',
  [UserSortField.NAME_BN]: 'u.nameBn',
  [UserSortField.LOGIN_EMAIL]: 'u.loginEmail',
  [UserSortField.CREATED_AT]: 'u.createdAt',
  [UserSortField.LAST_LOGIN_AT]: 'u.lastLoginAt',
};

export interface ActionContext {
  actor: AuthUser;
  ip: string | null;
}

/**
 * Admin user management (SPEC.md §5, §8 "Users (admin)"). Access to the routes is limited to
 * ADMIN by the controller; account-level rules (SUPER_ADMIN protection, no self-demotion) are
 * enforced here via assertCanManage.
 */
@Injectable()
export class UsersService {
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly dataSource: DataSource,
    config: ConfigService<EnvVars, true>,
  ) {
    this.frontendUrl = config
      .get('FRONTEND_URL', { infer: true })
      .replace(/\/+$/, '');
  }

  // ---------------------------------------------------------------- reads

  async list(
    query: UsersQueryDto,
  ): Promise<PaginatedResponseDto<UserSummaryDto>> {
    const qb = this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.designation', 'd')
      .leftJoinAndSelect('u.wing', 'w');

    if (query.q) {
      const like = `%${escapeLike(query.q)}%`;
      const likeDigits = `%${escapeLike(toAsciiDigits(query.q))}%`;
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('u.nameBn ILIKE :like')
            .orWhere('u.nameEn ILIKE :like')
            .orWhere('u.loginEmail ILIKE :like')
            .orWhere('u.mobile ILIKE :likeDigits'),
        ),
        { like, likeDigits },
      );
    }
    if (query.wingId)
      qb.andWhere('u.wingId = :wingId', { wingId: query.wingId });
    if (query.designationId) {
      qb.andWhere('u.designationId = :designationId', {
        designationId: query.designationId,
      });
    }
    if (query.role) qb.andWhere('u.role = :role', { role: query.role });
    if (query.isActive !== undefined) {
      qb.andWhere('u.isActive = :isActive', { isActive: query.isActive });
    }

    const order = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    const sortColumn = SORT_COLUMNS[query.sortBy];
    qb.orderBy(
      sortColumn,
      order,
      order === 'ASC' ? 'NULLS LAST' : 'NULLS FIRST',
    );
    // Tie-breakers for a stable order. TypeORM keys ORDER BY entries by column, so adding the
    // sort column again would silently overwrite the requested direction.
    if (sortColumn !== 'u.nameEn') qb.addOrderBy('u.nameEn', 'ASC');
    qb.addOrderBy('u.id', 'ASC').skip(query.skip).take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    return paginated(rows.map(toUserSummary), total, query);
  }

  async directory(
    query: DirectoryQueryDto,
  ): Promise<PaginatedResponseDto<DirectoryEntryDto>> {
    const qb: SelectQueryBuilder<User> = this.users
      .createQueryBuilder('u')
      .leftJoin('u.designation', 'd')
      .leftJoin('u.wing', 'w')
      // Only what the picker needs — never email, phone, role or status.
      .select(['u.id', 'u.nameBn', 'u.nameEn', 'u.photoPath'])
      .addSelect(['d.id', 'd.nameBn', 'd.nameEn', 'd.priority'])
      .addSelect(['w.id', 'w.nameBn', 'w.nameEn'])
      .where('u.isActive = true')
      .andWhere('u.role <> :system', { system: UserRole.SUPER_ADMIN });

    if (query.q) {
      // Names only: searching emails here would let officers probe who has which address.
      const like = `%${escapeLike(query.q)}%`;
      qb.andWhere(
        new Brackets((b) =>
          b.where('u.nameBn ILIKE :like').orWhere('u.nameEn ILIKE :like'),
        ),
        { like },
      );
    }
    if (query.wingId)
      qb.andWhere('u.wingId = :wingId', { wingId: query.wingId });

    qb.orderBy('d.priority', 'ASC', 'NULLS LAST')
      .addOrderBy('u.nameEn', 'ASC')
      .addOrderBy('u.id', 'ASC')
      .skip(query.skip)
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    return paginated(
      rows.map((u) => ({
        id: u.id,
        nameBn: u.nameBn,
        nameEn: u.nameEn,
        designation: u.designation
          ? {
              nameBn: u.designation.nameBn,
              nameEn: u.designation.nameEn,
              priority: u.designation.priority,
            }
          : null,
        wing: u.wing
          ? { id: u.wing.id, nameBn: u.wing.nameBn, nameEn: u.wing.nameEn }
          : null,
        photoPath: u.photoPath,
      })),
      total,
      query,
    );
  }

  async findOne(id: string): Promise<UserDetailDto> {
    return toUserDetail(await this.loadWithRelations(id));
  }

  // ---------------------------------------------------------------- writes

  /**
   * Creates an officer. No password is chosen by the admin and none is mailed: the account
   * gets an unusable random hash and the officer receives a one-time "set your password" link
   * (SET_INITIAL, 72 h).
   */
  async create(dto: CreateUserDto, ctx: ActionContext): Promise<UserDetailDto> {
    await this.assertDesignationUsable(dto.designationId);
    if (dto.wingId) await this.assertWingUsable(dto.wingId);
    await this.assertLoginEmailFree(dto.loginEmail);

    const passwordHash = await hashUnusablePassword();
    const notificationEmail = dto.notificationEmail ?? dto.loginEmail;
    const charges = dto.additionalCharges ?? [];

    const id = await this.dataSource
      .transaction(async (manager) => {
        const result = await manager.getRepository(User).insert({
          loginEmail: dto.loginEmail,
          notificationEmail,
          passwordHash,
          nameBn: dto.nameBn,
          nameEn: dto.nameEn,
          designationId: dto.designationId,
          designationRemark: dto.designationRemark ?? null,
          wingId: dto.wingId ?? null,
          mobile: dto.mobile ?? null,
          mobileAlt: dto.mobileAlt ?? null,
          officePhone: dto.officePhone ?? null,
          fax: dto.fax ?? null,
          organizationBn: dto.organizationBn ?? null,
          organizationEn: dto.organizationEn ?? null,
          bcsBatch: dto.bcsBatch ?? null,
          role: UserRole.OFFICER,
          isActive: true,
          mustChangePassword: true,
        });
        const userId = (result.identifiers[0] as { id: string }).id;
        await replaceAdditionalCharges(manager, userId, charges);
        await this.sendPasswordLink(
          manager,
          userId,
          dto.loginEmail,
          PasswordTokenPurpose.SET_INITIAL,
        );
        await this.audit.log(
          {
            actorId: ctx.actor.id,
            action: AuditAction.USER_CREATE,
            entityType: 'user',
            entityId: userId,
            after: { ...dto, notificationEmail, additionalCharges: charges },
            ip: ctx.ip,
          },
          manager,
        );
        return userId;
      })
      .catch((err: unknown) => this.rethrowDuplicateEmail(err));

    return this.findOne(id);
  }

  /** Edits profile fields, including loginEmail and designation (admin, SPEC.md §8). */
  async update(
    id: string,
    dto: UpdateUserDto,
    ctx: ActionContext,
  ): Promise<UserDetailDto> {
    const target = await this.loadWithRelations(id);
    assertCanManage(ctx.actor, target, 'update');

    const patch: Partial<Pick<User, EditableField>> = {};
    for (const field of EDITABLE_FIELDS) {
      const value = dto[field];
      if (value === undefined) continue;
      const label = REQUIRED_FIELDS[field];
      if (value === null && label) {
        throw new BadRequestException(USER_MESSAGES.fieldRequired(label));
      }
      (patch as Record<string, unknown>)[field] = value;
    }

    if (
      target.role === UserRole.SUPER_ADMIN &&
      (patch.designationId || patch.wingId)
    ) {
      throw new BadRequestException(USER_MESSAGES.superAdminNoDesignation);
    }

    const changes = pickChanges(target as Pick<User, EditableField>, patch);
    const currentCharges = this.chargeList(target);
    const newCharges = dto.additionalCharges;
    const chargesChanged =
      newCharges !== undefined &&
      (newCharges.length !== currentCharges.length ||
        newCharges.some((c, i) => c !== currentCharges[i]));
    if (!changes && !chargesChanged) return toUserDetail(target);

    if (changes && 'designationId' in changes.after) {
      await this.assertDesignationUsable(changes.after.designationId as string);
    }
    if (changes && changes.after.wingId) {
      await this.assertWingUsable(changes.after.wingId as string);
    }
    if (changes && 'loginEmail' in changes.after) {
      await this.assertLoginEmailFree(changes.after.loginEmail as string, id);
    }

    const before = { ...(changes?.before ?? {}) };
    const after = { ...(changes?.after ?? {}) };
    if (chargesChanged) {
      before.additionalCharges = currentCharges;
      after.additionalCharges = newCharges;
    }

    await this.dataSource
      .transaction(async (manager) => {
        if (changes) {
          await manager.getRepository(User).update(id, changes.after);
        }
        if (chargesChanged)
          await replaceAdditionalCharges(manager, id, newCharges);
        await this.audit.log(
          {
            actorId: ctx.actor.id,
            action: AuditAction.USER_UPDATE,
            entityType: 'user',
            entityId: id,
            before,
            after,
            ip: ctx.ip,
          },
          manager,
        );
      })
      .catch((err: unknown) => this.rethrowDuplicateEmail(err));

    return this.findOne(id);
  }

  /** Activate / deactivate. Deactivation ends every session immediately. */
  async setStatus(
    id: string,
    dto: UpdateUserStatusDto,
    ctx: ActionContext,
  ): Promise<UserDetailDto> {
    const target = await this.loadWithRelations(id);
    assertCanManage(ctx.actor, target, 'status', { deactivate: !dto.isActive });
    if (target.isActive === dto.isActive) return toUserDetail(target);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(User).update(id, { isActive: dto.isActive });
      if (!dto.isActive) await this.tokens.revokeAllForUser(id, manager);
      await this.audit.log(
        {
          actorId: ctx.actor.id,
          action: AuditAction.USER_STATUS_CHANGE,
          entityType: 'user',
          entityId: id,
          before: { isActive: target.isActive },
          after: { isActive: dto.isActive },
          ip: ctx.ip,
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  /** Promote to ADMIN or demote to OFFICER (SUPER_ADMIN is never assignable). */
  async setRole(
    id: string,
    dto: UpdateUserRoleDto,
    ctx: ActionContext,
  ): Promise<UserDetailDto> {
    const target = await this.loadWithRelations(id);
    assertCanManage(ctx.actor, target, 'role');
    if (target.role === dto.role) return toUserDetail(target);

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(User).update(id, { role: dto.role });
      await this.audit.log(
        {
          actorId: ctx.actor.id,
          action: AuditAction.USER_ROLE_CHANGE,
          entityType: 'user',
          entityId: id,
          before: { role: target.role },
          after: { role: dto.role },
          ip: ctx.ip,
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  /**
   * Admin reset: the current password stops working at once (unusable hash), every session
   * ends, and the user gets a one-time link (72 h) to choose a new password. No password is
   * generated, returned or mailed.
   */
  async resetPassword(id: string, ctx: ActionContext): Promise<void> {
    const target = await this.loadWithRelations(id);
    assertCanManage(ctx.actor, target, 'resetPassword');
    if (!target.isActive)
      throw new BadRequestException(USER_MESSAGES.resetInactive);

    const passwordHash = await hashUnusablePassword();
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(User).update(id, {
        passwordHash,
        mustChangePassword: true,
        failedLoginCount: 0,
      });
      await this.tokens.revokeAllForUser(id, manager);
      await this.sendPasswordLink(
        manager,
        id,
        target.loginEmail,
        PasswordTokenPurpose.RESET,
      );
      await this.audit.log(
        {
          actorId: ctx.actor.id,
          action: AuditAction.USER_PASSWORD_RESET_BY_ADMIN,
          entityType: 'user',
          entityId: id,
          ip: ctx.ip,
        },
        manager,
      );
    });
  }

  /** One-time password link by e-mail (closes older links). Used by create and reset. */
  private async sendPasswordLink(
    manager: EntityManager,
    userId: string,
    loginEmail: string,
    purpose: PasswordTokenPurpose,
  ): Promise<void> {
    const initial = purpose === PasswordTokenPurpose.SET_INITIAL;
    const validHours = initial
      ? SET_INITIAL_TOKEN_TTL_HOURS
      : ADMIN_RESET_TOKEN_TTL_HOURS;
    const rawToken = await issuePasswordToken(
      manager,
      userId,
      purpose,
      validHours * 3_600_000,
    );
    const link = `${this.frontendUrl}/${initial ? 'set-password' : 'reset-password'}?token=${encodeURIComponent(rawToken)}`;
    await this.notifications.notify(
      [userId],
      {
        type: initial
          ? NotificationType.ACCOUNT_CREATED
          : NotificationType.PASSWORD_RESET_LINK,
        title: initial ? 'অ্যাকাউন্ট তৈরি হয়েছে' : 'পাসওয়ার্ড রিসেট',
        body: 'পাসওয়ার্ড সেট করার লিংক পাঠানো হয়েছে।',
        email: (r) =>
          (initial ? setPasswordMail : adminResetMail)({
            nameBn: r.nameBn,
            loginEmail,
            link,
            validHours,
          }),
      },
      [ChannelName.EMAIL],
      manager,
    );
  }

  // ---------------------------------------------------------------- helpers

  private async loadWithRelations(id: string): Promise<User> {
    const user = await this.users.findOne({
      where: { id },
      relations: { designation: true, wing: true, additionalCharges: true },
      order: { additionalCharges: { createdAt: 'ASC' } },
    });
    if (!user) throw new NotFoundException(USER_MESSAGES.notFound);
    return user;
  }

  private async assertDesignationUsable(id: string): Promise<void> {
    const designation = await this.dataSource
      .getRepository(Designation)
      .findOne({ where: { id }, select: { id: true, isActive: true } });
    if (!designation)
      throw new BadRequestException(USER_MESSAGES.designationNotFound);
    if (!designation.isActive) {
      throw new BadRequestException(USER_MESSAGES.designationInactive);
    }
  }

  private async assertWingUsable(id: string): Promise<void> {
    const wing = await this.dataSource
      .getRepository(Wing)
      .findOne({ where: { id }, select: { id: true, isActive: true } });
    if (!wing) throw new BadRequestException(USER_MESSAGES.wingNotFound);
    if (!wing.isActive)
      throw new BadRequestException(USER_MESSAGES.wingInactive);
  }

  private async assertLoginEmailFree(
    loginEmail: string,
    exceptId?: string,
  ): Promise<void> {
    const exists = await this.users.exists({
      where: exceptId ? { loginEmail, id: Not(exceptId) } : { loginEmail },
    });
    if (exists) throw new ConflictException(USER_MESSAGES.duplicateLoginEmail);
  }

  private rethrowDuplicateEmail(err: unknown): never {
    if (isUniqueViolation(err, LOGIN_EMAIL_INDEX)) {
      throw new ConflictException(USER_MESSAGES.duplicateLoginEmail);
    }
    throw err;
  }

  private chargeList(user: User): string[] {
    return (user.additionalCharges ?? []).map((c) => c.description);
  }
}
