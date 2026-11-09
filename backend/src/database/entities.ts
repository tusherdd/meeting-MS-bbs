/**
 * Every TypeORM entity, registered explicitly (no file globs) so the app, the migration CLI
 * and tests always load exactly the same set. Add new entities here.
 */
import { AuditLog } from '../modules/audit/entities/audit-log.entity';
import { PasswordResetToken } from '../modules/auth/entities/password-reset-token.entity';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { ChangeRequest } from '../modules/change-requests/entities/change-request.entity';
import { Designation } from '../modules/designations/entities/designation.entity';
import { EmailOutbox } from '../modules/mail/entities/email-outbox.entity';
import { MeetingConflict } from '../modules/meetings/entities/meeting-conflict.entity';
import { MeetingParticipant } from '../modules/meetings/entities/meeting-participant.entity';
import { Meeting } from '../modules/meetings/entities/meeting.entity';
import { Notification } from '../modules/notifications/entities/notification.entity';
import { UserAdditionalCharge } from '../modules/users/entities/user-additional-charge.entity';
import { User } from '../modules/users/entities/user.entity';
import { Wing } from '../modules/wings/entities/wing.entity';

export const ENTITIES = [
  Designation,
  Wing,
  User,
  UserAdditionalCharge,
  RefreshToken,
  PasswordResetToken,
  ChangeRequest,
  Meeting,
  MeetingParticipant,
  MeetingConflict,
  Notification,
  EmailOutbox,
  AuditLog,
];
