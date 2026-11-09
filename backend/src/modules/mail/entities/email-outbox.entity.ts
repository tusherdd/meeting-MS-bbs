import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { EmailStatus } from '../enums/email-status.enum';

/**
 * Outgoing mail queue. Business code only inserts rows; a scheduled worker sends PENDING mail,
 * retrying with backoff, so no request ever waits for SMTP (SPEC.md §6.5). SENT rows keep only
 * to/subject/status and are deleted after 30 days.
 */
@Entity('email_outbox')
@Index('IDX_email_outbox_status_nextAttemptAt', ['status', 'nextAttemptAt'])
export class EmailOutbox extends BaseEntity {
  @Column({ type: 'varchar', length: 254 })
  to!: string;

  @Column({ type: 'varchar', length: 500 })
  subject!: string;

  /** HTML body. Set to NULL once the mail is SENT (privacy: links/tokens do not linger). */
  @Column({ type: 'text', nullable: true })
  html!: string | null;

  /** Plain-text alternative for mail clients without HTML; purged with html. */
  @Column({ type: 'text', nullable: true })
  text!: string | null;

  @Column({ type: 'varchar', length: 20, default: EmailStatus.PENDING })
  status!: EmailStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  /** The worker picks rows whose nextAttemptAt has passed. */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  nextAttemptAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt!: Date | null;
}
