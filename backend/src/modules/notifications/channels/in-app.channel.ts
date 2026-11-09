import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import {
  ChannelName,
  type NotificationChannel,
  type NotificationMessage,
  type NotificationRecipient,
} from './notification-channel';

/** Bell notifications: one row per recipient in the notifications table. */
@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly name = ChannelName.IN_APP;

  async deliver(
    recipients: NotificationRecipient[],
    message: NotificationMessage,
    manager: EntityManager,
  ): Promise<void> {
    if (recipients.length === 0) return;
    await manager.getRepository(Notification).insert(
      recipients.map((r) => ({
        userId: r.id,
        type: message.type,
        title: message.title.slice(0, 300),
        body: message.body,
        link: message.link ?? null,
      })),
    );
  }
}
