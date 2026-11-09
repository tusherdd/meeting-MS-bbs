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
import { User } from '../../users/entities/user.entity';
import { MeetingStatus } from '../enums/meeting-status.enum';
import { MeetingParticipant } from './meeting-participant.entity';

/**
 * A meeting created by an officer (the organizer). `priority` is a snapshot of the organizer's
 * designation priority at creation time and drives the conflict engine (SPEC.md §6.3–6.4).
 */
@Entity('meetings')
@Index('IDX_meetings_startAt_endAt_status', ['startAt', 'endAt', 'status'])
@Check('CHK_meetings_endAt_after_startAt', `"endAt" > "startAt"`)
export class Meeting extends BaseEntity {
  @Column({ type: 'varchar', length: 300 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  agenda!: string | null;

  @Column({ type: 'timestamptz' })
  startAt!: Date;

  @Column({ type: 'timestamptz' })
  endAt!: Date;

  /** Free text, typed manually. Not checked for conflicts. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  room!: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  onlineLink!: string | null;

  @Column({ type: 'uuid' })
  organizerId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organizerId' })
  organizer!: Relation<User>;

  /** Optional chairperson. Does not affect priority. */
  @Column({ type: 'uuid', nullable: true })
  chairId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'chairId' })
  chair!: Relation<User> | null;

  /** Lower number = higher priority. */
  @Column({ type: 'int' })
  priority!: number;

  @Column({ type: 'varchar', length: 20, default: MeetingStatus.SCHEDULED })
  status!: MeetingStatus;

  @Column({ type: 'text', nullable: true })
  cancelReason!: string | null;

  /** Notes / minutes, saved when the meeting is completed. */
  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @OneToMany(() => MeetingParticipant, (participant) => participant.meeting)
  participants!: Relation<MeetingParticipant>[];
}
