import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Meeting } from '../../meetings/entities/meeting.entity';
import { User } from '../../users/entities/user.entity';

/**
 * "অন্যান্য সংযুক্তি" / other attachments of a meeting (v1.17, SPEC.md §6.11): at most 5 files per
 * meeting (checked in the service), each with a label typed by the organizer. The bytes live on disk
 * under DECISION_UPLOAD_DIR/attachments/<meetingId>/<storedName> (never served statically); only
 * the metadata is stored here. Deleting the meeting deletes the rows (CASCADE).
 */
@Entity('meeting_attachments')
export class MeetingAttachment extends BaseEntity {
  @Index('IDX_meeting_attachments_meetingId')
  @Column({ type: 'uuid' })
  meetingId!: string;

  @ManyToOne(() => Meeting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'meetingId' })
  meeting!: Relation<Meeting>;

  /** The label typed by the organizer ("ফাইলের নাম"): trimmed, normalizeBangla, max 150. */
  @Column({ type: 'varchar', length: 150 })
  name!: string;

  /** The client's file name, sanitized (no path, no control characters). */
  @Column({ type: 'varchar', length: 200 })
  originalName!: string;

  /** Random name on disk ("<uuid>.pdf"); never derived from user input. */
  @Column({ type: 'varchar', length: 64 })
  storedName!: string;

  /** Detected from the bytes: PDF, DOCX, JPEG or PNG. */
  @Column({ type: 'varchar', length: 100 })
  mime!: string;

  /** Stored size in bytes (after image metadata was stripped). */
  @Column({ type: 'integer' })
  size!: number;

  /** SHA-256 (hex) of the stored bytes. */
  @Column({ type: 'char', length: 64 })
  sha256!: string;

  @Column({ type: 'uuid' })
  uploadedById!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy!: Relation<User>;
}
