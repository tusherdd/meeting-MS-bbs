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

/**
 * One issued refresh token (stored hashed). Rotation sets `revokedAt` and `replacedById`;
 * presenting an already-replaced token is reuse → revoke all of the user's tokens (SPEC.md §9.3).
 */
@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  @Index('IDX_refresh_tokens_userId')
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: Relation<User>;

  @Index('UQ_refresh_tokens_tokenHash', { unique: true })
  @Column({ type: 'varchar', length: 128, select: false })
  tokenHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  /** The token that replaced this one during rotation. */
  @Column({ type: 'uuid', nullable: true })
  replacedById!: string | null;

  @ManyToOne(() => RefreshToken, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replacedById' })
  replacedBy!: Relation<RefreshToken> | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  /** IPv4 or IPv6 (max 45 chars). */
  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;
}
