import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { ChangeRequestStatus } from '../enums/change-request-status.enum';
import { ChangeRequestType } from '../enums/change-request-type.enum';

/**
 * An officer's request to change login email or designation. Admin approves or rejects;
 * on approval the change is applied (SPEC.md §6.2).
 */
@Entity('change_requests')
export class ChangeRequest extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user!: Relation<User>;

  @Column({ type: 'varchar', length: 30 })
  type!: ChangeRequestType;

  /** Requested value, e.g. { "loginEmail": "..." } or { "designationId": "..." }. */
  @Column({ type: 'jsonb' })
  newValue!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: ChangeRequestStatus.PENDING })
  status!: ChangeRequestStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewedById' })
  reviewedBy!: Relation<User> | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewNote!: string | null;
}
