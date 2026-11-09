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

/** In-app bell notification for one officer. `readAt = null` means unread. */
@Entity('notifications')
@Index('IDX_notifications_userId_readAt', ['userId', 'readAt'])
export class Notification extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: Relation<User>;

  /** e.g. MEETING_INVITED, CONFLICT_RAISED. The value list is defined in step 7. */
  @Column({ type: 'varchar', length: 50 })
  type!: string;

  @Column({ type: 'varchar', length: 300 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  /** Frontend path to open when clicked. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  link!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;
}
