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
 * The uploaded meeting notice "সভার নোটিশ" (v1.13, SPEC.md §6.8): at most ONE file per meeting
 * (unique meetingId), a PDF, DOCX, JPEG or PNG uploaded by the meeting's organizer. The bytes
 * live on disk under DECISION_UPLOAD_DIR/notices/<meetingId>/<storedName> (never served
 * statically); only the metadata is stored here. A replace deletes the old row and inserts a
 * new one, so `createdAt` is the upload time. Deleting the meeting deletes the row (CASCADE).
 */
@Entity('meeting_notice_files')
export class MeetingNoticeFile extends BaseEntity {
  @Index('UQ_meeting_notice_files_meetingId', { unique: true })
  @Column({ type: 'uuid' })
  meetingId!: string;

  @ManyToOne(() => Meeting, (meeting) => meeting.noticeFiles, {
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

  /** Random name on disk ("<uuid>.docx"); never derived from user input. */
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
}
