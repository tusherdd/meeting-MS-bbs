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
import { ParticipantRole } from '../enums/participant-role.enum';
import { Meeting } from './meeting.entity';

/** An officer invited to a meeting. One row per (meeting, officer). */
@Entity('meeting_participants')
@Index('UQ_meeting_participants_meetingId_userId', ['meetingId', 'userId'], {
  unique: true,
})
export class MeetingParticipant extends BaseEntity {
  @Column({ type: 'uuid' })
  meetingId!: string;

  @ManyToOne(() => Meeting, (meeting) => meeting.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'meetingId' })
  meeting!: Relation<Meeting>;

  /** Indexed: "which meetings is this officer in?" is the conflict engine's main lookup. */
  @Index('IDX_meeting_participants_userId')
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user!: Relation<User>;

  @Column({ type: 'varchar', length: 10, default: ParticipantRole.MEMBER })
  role!: ParticipantRole;
}
