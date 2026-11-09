import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { PasswordTokenPurpose } from '../enums/password-token-purpose.enum';

/**
 * Single-use, expiring password token (stored hashed, SPEC.md §9.12): "forgot password",
 * admin reset, or the first password of a new account (purpose).
 */
@Entity('password_reset_tokens')
export class PasswordResetToken extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: Relation<User>;

  @Index('UQ_password_reset_tokens_tokenHash', { unique: true })
  @Column({ type: 'varchar', length: 128, select: false })
  tokenHash!: string;

  @Column({ type: 'varchar', length: 20, default: PasswordTokenPurpose.RESET })
  purpose!: PasswordTokenPurpose;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  /** Set when the token is used; a used token can never be used again. */
  @Column({ type: 'timestamptz', nullable: true })
  usedAt!: Date | null;
}
