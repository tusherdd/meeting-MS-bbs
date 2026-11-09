import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { EnvVars } from '../../../config/env.validation';
import { MailService } from '../../mail/mail.service';
import { genericNotificationMail } from '../../mail/templates/mail-templates';
import {
  ChannelName,
  type NotificationChannel,
  type NotificationMessage,
  type NotificationRecipient,
} from './notification-channel';

/** E-mail via the outbox, always to the recipient's verified notification email. */
@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly name = ChannelName.EMAIL;
  private readonly frontendUrl: string;

  constructor(
    private readonly mail: MailService,
    config: ConfigService<EnvVars, true>,
  ) {
    this.frontendUrl = config
      .get('FRONTEND_URL', { infer: true })
      .replace(/\/+$/, '');
  }

  async deliver(
    recipients: NotificationRecipient[],
    message: NotificationMessage,
    manager: EntityManager,
  ): Promise<void> {
    for (const recipient of recipients) {
      const content = message.email
        ? message.email(recipient)
        : genericNotificationMail({
            nameBn: recipient.nameBn,
            title: message.title,
            body: message.body,
            link: message.link ? `${this.frontendUrl}${message.link}` : null,
          });
      await this.mail.enqueue(
        { to: recipient.notificationEmail, ...content },
        manager,
      );
    }
  }
}
