import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  type Relation,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { lowercaseTransformer } from '../../../common/entities/lowercase.transformer';
import { Designation } from '../../designations/entities/designation.entity';
import { Wing } from '../../wings/entities/wing.entity';
import { UserRole } from '../enums/user-role.enum';
import { UserAdditionalCharge } from './user-additional-charge.entity';

/**
 * An officer account. Accounts are created only by admins and are never hard-deleted
 * (deactivate with `isActive = false`), so history (meetings, audit) always keeps its owner.
 * Secrets (`passwordHash`, `*TokenHash`) use `select: false` and must be selected explicitly.
 */
@Entity('users')
@Check('CHK_users_loginEmail_lowercase', `"loginEmail" = lower("loginEmail")`)
@Check(
  'CHK_users_notificationEmail_lowercase',
  `"notificationEmail" = lower("notificationEmail")`,
)
@Check(
  'CHK_users_pendingNotificationEmail_lowercase',
  `"pendingNotificationEmail" = lower("pendingNotificationEmail")`,
)
@Check(
  'CHK_users_designation_required',
  `"role" = 'SUPER_ADMIN' OR "designationId" IS NOT NULL`,
)
export class User extends BaseEntity {
  /** Login id. Changed only through an approved change request. */
  @Index('UQ_users_loginEmail', { unique: true })
  @Column({ type: 'varchar', length: 254, transformer: lowercaseTransformer })
  loginEmail!: string;

  /** Where all mail is sent. */
  @Column({ type: 'varchar', length: 254, transformer: lowercaseTransformer })
  notificationEmail!: string;

  /** New notification email waiting for its verification link to be clicked. */
  @Column({
    type: 'varchar',
    length: 254,
    nullable: true,
    transformer: lowercaseTransformer,
  })
  pendingNotificationEmail!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true, select: false })
  notificationEmailTokenHash!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  notificationEmailTokenExpiresAt!: Date | null;

  /** argon2id hash. Never returned by any API. */
  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 200 })
  nameBn!: string;

  @Column({ type: 'varchar', length: 200 })
  nameEn!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mobile!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mobileAlt!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  officePhone!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  fax!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  photoPath!: string | null;

  /**
   * Nullable only for the SUPER_ADMIN system account (no designation = no priority, so it can
   * never organize meetings). Enforced by CHK_users_designation_required.
   */
  @Column({ type: 'uuid', nullable: true })
  designationId!: string | null;

  @ManyToOne(() => Designation, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'designationId' })
  designation!: Relation<Designation> | null;

  /** e.g. "(ভারপ্রাপ্ত)", "(চলতি দায়িত্ব)". Does not change priority. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  designationRemark!: string | null;

  @Column({ type: 'uuid', nullable: true })
  wingId!: string | null;

  @ManyToOne(() => Wing, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'wingId' })
  wing!: Relation<Wing> | null;

  /** e.g. "বাংলাদেশ পরিসংখ্যান ব্যুরো". */
  @Column({ type: 'text', nullable: true })
  organizationBn!: string | null;

  /** e.g. "Bangladesh Bureau of Statistics". */
  @Column({ type: 'text', nullable: true })
  organizationEn!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bcsBatch!: string | null;

  @Column({ type: 'varchar', length: 20, default: UserRole.OFFICER })
  role!: UserRole;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', default: true })
  mustChangePassword!: boolean;

  @Column({ type: 'int', default: 0 })
  failedLoginCount!: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @OneToMany(() => UserAdditionalCharge, (charge) => charge.user)
  additionalCharges!: Relation<UserAdditionalCharge>[];
}
