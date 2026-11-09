import type { EntityManager } from 'typeorm';
import type { MailContent } from '../../mail/templates/mail-templates';
import type { NotificationType } from '../enums/notification-type.enum';

export enum ChannelName {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
}

/** The person a message is delivered to (loaded once, shared by all channels). */
export interface NotificationRecipient {
  id: string;
  nameBn: string;
  /** Verified address; pending (unverified) addresses are never used. */
  notificationEmail: string;
}

export interface NotificationMessage {
  type: NotificationType;
  title: string;
  body: string;
  /** Frontend path, e.g. /profile/change-requests */
  link?: string | null;
  /**
   * Personalised e-mail for one recipient. Without it, EmailChannel sends the generic
   * notification mail built from title/body/link.
   */
  email?: (recipient: NotificationRecipient) => MailContent;
}

/**
 * A way to deliver notifications (SPEC.md §6.5). New channels (SMS, WhatsApp) implement this
 * and register in NotificationsModule; no business code changes.
 */
export interface NotificationChannel {
  readonly name: ChannelName;
  deliver(
    recipients: NotificationRecipient[],
    message: NotificationMessage,
    manager: EntityManager,
  ): Promise<void>;
}

/** DI token for the list of channels. */
export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');
