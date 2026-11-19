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
 * A meeting decision file ("সভা কার্যবিবরণী", v1.11, SPEC.md §6.9): a PDF, DOCX (v1.13), JPEG or PNG uploaded by one
 * of the meeting's people after the meeting started. The bytes live on disk under
 * DECISION_UPLOAD_DIR/<meetingId>/<storedName> (never served statically); only the metadata is
 * stored here. Deleting the meeting deletes the rows (CASCADE); the service removes the files.
 */
@Entity('meeting_decision_files')
export class MeetingDecisionFile extends BaseEntity {
  @Index('IDX_meeting_decision_files_meetingId')
  @Column({ type: 'uuid' })
  meetingId!: string;

  @ManyToOne(() => Meeting, (meeting) => meeting.decisionFiles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'meetingId' })
  meeting!: Relation<Meeting>;

  @Column({ type: 'uuid' })
  uploadedById!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy!: Relation<User>;

  /** The client's file name, sanitized (no path, no control characters, max 200). */
  @Column({ type: 'varchar', length: 200 })
  originalName!: string;

  /** Random name on disk ("<uuid>.pdf"); never derived from user input. */
  @Column({ type: 'varchar', length: 64 })
  storedName!: string;

  /** Detected from the bytes: PDF, DOCX (v1.13; its type is 71 characters long), JPEG or PNG. */
  @Column({ type: 'varchar', length: 100 })
  mime!: string;

  /** Stored size in bytes (after image metadata was stripped). */
  @Column({ type: 'integer' })
  size!: number;

  /** SHA-256 (hex) of the stored bytes. */
  @Column({ type: 'char', length: 64 })
  sha256!: string;
}
