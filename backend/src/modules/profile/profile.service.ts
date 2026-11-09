import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import { pickChanges } from '../../common/utils/changes';
import { generateSecureToken, sha256Hex } from '../../common/utils/token';
import { EnvVars } from '../../config/env.validation';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MailService } from '../mail/mail.service';
import {
  notificationEmailChangeNoticeMail,
  notificationEmailVerifyMail,
} from '../mail/templates/mail-templates';
import { ChannelName } from '../notifications/channels/notification-channel';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { replaceAdditionalCharges, toUserDetail } from '../users/user-mapper';
import { Wing } from '../wings/entities/wing.entity';
import { AvatarImageError, processAvatar } from './avatar-image';
import { AvatarStorageService } from './avatar-storage.service';
import type {
  ChangeNotificationEmailDto,
  ProfileResponseDto,
  UpdateProfileDto,
} from './dto/profile.dto';
import { NOTIFICATION_EMAIL_TOKEN_TTL_HOURS } from './profile.constants';
import { PROFILE_MESSAGES } from './profile.messages';

/** Fields an officer may edit themselves (must match UpdateProfileDto). */
const PROFILE_FIELDS = [
  'nameBn',
  'nameEn',
  'mobile',
  'mobileAlt',
  'officePhone',
  'fax',
  'wingId',
  'designationRemark',
] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];

const REQUIRED: Partial<Record<ProfileField, string>> = {
  nameBn: 'বাংলা নাম',
  nameEn: 'ইংরেজি নাম',
};

/** Own profile, photo and notification email (SPEC.md §6.2, §8 "Profile"). */
@Injectable()
export class ProfileService {
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly avatars: AvatarStorageService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly dataSource: DataSource,
    config: ConfigService<EnvVars, true>,
  ) {
    this.frontendUrl = config
      .get('FRONTEND_URL', { infer: true })
      .replace(/\/+$/, '');
  }

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    return this.toProfile(await this.load(userId));
  }

  // ---------------------------------------------------------------- profile fields

  async update(
    actor: AuthUser,
    dto: UpdateProfileDto,
    ip: string | null,
  ): Promise<ProfileResponseDto> {
    const user = await this.load(actor.id);

    const patch: Partial<Pick<User, ProfileField>> = {};
    for (const field of PROFILE_FIELDS) {
      const value = dto[field];
      if (value === undefined) continue;
      const label = REQUIRED[field];
      if (value === null && label) {
        throw new BadRequestException(PROFILE_MESSAGES.fieldRequired(label));
      }
      (patch as Record<string, unknown>)[field] = value;
    }

    if (patch.wingId) {
      if (user.role === UserRole.SUPER_ADMIN) {
        throw new BadRequestException(PROFILE_MESSAGES.superAdminNoWing);
      }
      if (patch.wingId !== user.wingId)
        await this.assertWingActive(patch.wingId);
    }

    const changes = pickChanges(user as Pick<User, ProfileField>, patch);
    const current = (user.additionalCharges ?? []).map((c) => c.description);
    const charges = dto.additionalCharges;
    const chargesChanged =
      charges !== undefined &&
      (charges.length !== current.length ||
        charges.some((c, i) => c !== current[i]));
    if (!changes && !chargesChanged) return this.toProfile(user);

    // Audit: changed field NAMES only — no phone numbers or other values (step 6).
    const fields = [
      ...Object.keys(changes?.after ?? {}),
      ...(chargesChanged ? ['additionalCharges'] : []),
    ];

    await this.dataSource.transaction(async (manager) => {
      if (changes) {
        await manager.getRepository(User).update(user.id, changes.after);
      }
      if (chargesChanged)
        await replaceAdditionalCharges(manager, user.id, charges);
      await this.audit.log(
        {
          actorId: user.id,
          action: AuditAction.PROFILE_UPDATE,
          entityType: 'user',
          entityId: user.id,
          after: { fields },
          ip,
        },
        manager,
      );
    });
    return this.getProfile(user.id);
  }

  // ---------------------------------------------------------------- photo

  async uploadPhoto(
    actor: AuthUser,
    file: Express.Multer.File | undefined,
    ip: string | null,
  ): Promise<ProfileResponseDto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException(PROFILE_MESSAGES.photoMissing);
    }

    let webp: Buffer;
    try {
      webp = await processAvatar(file.buffer);
    } catch (err) {
      if (err instanceof AvatarImageError) {
        throw new BadRequestException(
          err.reason === 'type'
            ? PROFILE_MESSAGES.photoBadType
            : PROFILE_MESSAGES.photoUnreadable,
        );
      }
      throw err;
    }

    const user = await this.load(actor.id);
    const newPath = await this.avatars.save(webp);
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager
          .getRepository(User)
          .update(user.id, { photoPath: newPath });
        await this.audit.log(
          {
            actorId: user.id,
            action: AuditAction.PROFILE_PHOTO_UPDATE,
            entityType: 'user',
            entityId: user.id,
            ip,
          },
          manager,
        );
      });
    } catch (err) {
      await this.avatars.remove(newPath); // DB not updated → do not leave an orphan file
      throw err;
    }
    // Only after the DB points to the new file is the old one deleted.
    await this.avatars.remove(user.photoPath);
    return this.getProfile(user.id);
  }

  async deletePhoto(actor: AuthUser, ip: string | null): Promise<void> {
    const user = await this.load(actor.id);
    if (!user.photoPath) return;
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(User).update(user.id, { photoPath: null });
      await this.audit.log(
        {
          actorId: user.id,
          action: AuditAction.PROFILE_PHOTO_DELETE,
          entityType: 'user',
          entityId: user.id,
          ip,
        },
        manager,
      );
    });
    await this.avatars.remove(user.photoPath);
  }

  // ---------------------------------------------------------------- notification email

  /**
   * Stores the new address as pending and mails a verification link to it, plus a notice to
   * the current address. The login email is never touched.
   */
  async requestNotificationEmailChange(
    actor: AuthUser,
    dto: ChangeNotificationEmailDto,
    ip: string | null,
  ): Promise<void> {
    const user = await this.load(actor.id);
    if (dto.email === user.notificationEmail) {
      throw new BadRequestException(PROFILE_MESSAGES.sameNotificationEmail);
    }

    const rawToken = generateSecureToken();
    const verifyLink = `${this.frontendUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;

    await this.dataSource.transaction(async (manager) => {
      // A new request replaces any earlier pending one (its link stops working).
      await manager.getRepository(User).update(user.id, {
        pendingNotificationEmail: dto.email,
        notificationEmailTokenHash: sha256Hex(rawToken),
        notificationEmailTokenExpiresAt: new Date(
          Date.now() + NOTIFICATION_EMAIL_TOKEN_TTL_HOURS * 3_600_000,
        ),
      });
      // The new address is not verified yet, so this one goes to it directly (not via notify).
      await this.mail.enqueue(
        {
          to: dto.email,
          ...notificationEmailVerifyMail({
            nameBn: user.nameBn,
            link: verifyLink,
            validHours: NOTIFICATION_EMAIL_TOKEN_TTL_HOURS,
          }),
        },
        manager,
      );
      // Notice to the current (verified) notification email.
      await this.notifications.notify(
        [user.id],
        {
          type: NotificationType.NOTIFICATION_EMAIL_CHANGE_REQUESTED,
          title: 'নোটিফিকেশন ইমেইল পরিবর্তনের অনুরোধ',
          body: 'নোটিফিকেশন ইমেইল পরিবর্তনের অনুরোধ করা হয়েছে।',
          email: (r) =>
            notificationEmailChangeNoticeMail({
              nameBn: r.nameBn,
              newEmail: dto.email,
            }),
        },
        [ChannelName.EMAIL],
        manager,
      );
      await this.audit.log(
        {
          actorId: user.id,
          action: AuditAction.NOTIFICATION_EMAIL_CHANGE_REQUEST,
          entityType: 'user',
          entityId: user.id,
          before: { notificationEmail: user.notificationEmail },
          after: { pendingNotificationEmail: dto.email },
          ip,
        },
        manager,
      );
    });
  }

  /**
   * Activates the pending address. A single atomic UPDATE checks token + expiry and clears the
   * token, so a link works exactly once even if clicked twice at the same moment.
   */
  async verifyNotificationEmail(
    rawToken: string,
    ip: string | null,
  ): Promise<void> {
    const tokenHash = sha256Hex(rawToken);
    const verified = await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(User)
        .set({
          notificationEmail: () => '"pendingNotificationEmail"',
          pendingNotificationEmail: null,
          notificationEmailTokenHash: null,
          notificationEmailTokenExpiresAt: null,
        })
        .where('"notificationEmailTokenHash" = :tokenHash', { tokenHash })
        .andWhere('"notificationEmailTokenExpiresAt" > now()')
        .andWhere('"pendingNotificationEmail" IS NOT NULL')
        .returning(['id', 'notificationEmail'])
        .execute();
      const row = (
        result.raw as Array<{ id: string; notificationEmail: string }>
      )[0];
      if (!row) return false;
      await this.audit.log(
        {
          actorId: row.id,
          action: AuditAction.NOTIFICATION_EMAIL_VERIFIED,
          entityType: 'user',
          entityId: row.id,
          after: { notificationEmail: row.notificationEmail },
          ip,
        },
        manager,
      );
      return true;
    });
    if (!verified)
      throw new BadRequestException(PROFILE_MESSAGES.invalidVerifyToken);
  }

  // ---------------------------------------------------------------- helpers

  private async load(userId: string): Promise<User> {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: { designation: true, wing: true, additionalCharges: true },
      order: { additionalCharges: { createdAt: 'ASC' } },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private async assertWingActive(wingId: string): Promise<void> {
    const wing = await this.dataSource
      .getRepository(Wing)
      .findOne({ where: { id: wingId }, select: { id: true, isActive: true } });
    if (!wing?.isActive)
      throw new BadRequestException(PROFILE_MESSAGES.wingInactive);
  }

  /** Same as the admin detail view, minus the admin-only fields. */
  private toProfile(user: User): ProfileResponseDto {
    const detail: Partial<ReturnType<typeof toUserDetail>> = toUserDetail(user);
    delete detail.failedLoginCount;
    delete detail.isActive;
    return detail as ProfileResponseDto;
  }
}
