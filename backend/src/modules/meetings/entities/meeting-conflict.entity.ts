import { Column, Entity, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { ConflictStatus } from '../enums/conflict-status.enum';
import { Meeting } from './meeting.entity';

/**
 * Record that a higher-priority meeting overlaps a lower-priority one for a shared officer.
 * The lower meeting's people are asked to cancel/reschedule; becomes RESOLVED automatically
 * when the clash disappears (SPEC.md §6.4).
 */
@Entity('meeting_conflicts')
export class MeetingConflict extends BaseEntity {
  @Column({ type: 'uuid' })
  higherMeetingId!: string;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'higherMeetingId' })
  higherMeeting!: Relation<Meeting>;

  @Column({ type: 'uuid' })
  lowerMeetingId!: string;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lowerMeetingId' })
  lowerMeeting!: Relation<Meeting>;

  /** The officer who is in both meetings. */
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user!: Relation<User>;

  @Column({ type: 'varchar', length: 20, default: ConflictStatus.PENDING })
  status!: ConflictStatus;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;
}
