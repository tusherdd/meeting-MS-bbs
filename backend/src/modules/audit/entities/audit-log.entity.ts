import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Append-only trail of important actions (login, user/role changes, meeting changes, ...)
 * with before/after snapshots (SPEC.md §9.13). Rows are never updated or deleted.
 */
@Entity('audit_logs')
export class AuditLog extends BaseEntity {
  /** Null for system actions or unknown users (e.g. failed login). */
  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actorId' })
  actor!: Relation<User> | null;

  /** e.g. LOGIN, USER_CREATE, MEETING_CANCEL. The value list is defined in step 10. */
  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ type: 'varchar', length: 100 })
  entityType!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  entityId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  before!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;
}
