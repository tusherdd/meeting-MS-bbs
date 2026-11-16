import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { lowercaseTransformer } from '../../../common/entities/lowercase.transformer';
import { Meeting } from './meeting.entity';

/**
 * A guest officer (অতিথি কর্মকর্তা, SPEC.md §6.7): someone invited to a meeting who has no account.
 * Guests receive meeting mails only; they never take part in the conflict engine, are not
 * counted in statistics and cannot log in.
 *
 * Further constraints created by migration MeetingGuests1794802927549 (not expressible as decorators,
 * hence `synchronize: false` so migration:generate leaves them alone):
 * - unique (meetingId, lower(email)): one guest per address per meeting;
 * - partial unique (meetingId) WHERE isChair: at most one guest chair per meeting;
 * - a deferred constraint trigger: a meeting never has an officer chair (meetings.chairId) and a
 *   guest chair at the same time.
 */
@Entity('meeting_guests')
@Check('CHK_meeting_guests_email_lowercase', `"email" = lower(btrim("email"))`)
@Index('UQ_meeting_guests_meetingId_email', { synchronize: false })
@Index('UQ_meeting_guests_one_chair', { synchronize: false })
export class MeetingGuest extends BaseEntity {
  @Index('IDX_meeting_guests_meetingId')
  @Column({ type: 'uuid' })
  meetingId!: string;

  @ManyToOne(() => Meeting, (meeting) => meeting.guests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'meetingId' })
  meeting!: Relation<Meeting>;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 200 })
  designation!: string;

  /** Stored lowercased (like users' emails). */
  @Column({ type: 'varchar', length: 254, transformer: lowercaseTransformer })
  email!: string;

  @Column({ type: 'boolean', default: false })
  isChair!: boolean;
}
