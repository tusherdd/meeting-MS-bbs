import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import {
  paginated,
  type PaginatedResponseDto,
} from '../../common/dto/paginated-response.dto';
import { User } from '../users/entities/user.entity';
import {
  ChannelName,
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type NotificationMessage,
  type NotificationRecipient,
} from './channels/notification-channel';
import type {
  NotificationQueryDto,
  NotificationResponseDto,
} from './dto/notification.dto';
import { Notification } from './entities/notification.entity';

export const ALL_CHANNELS = [ChannelName.IN_APP, ChannelName.EMAIL] as const;

/**
 * Single entry point for telling users something (SPEC.md §6.5): bell and/or e-mail.
 * Inactive users are skipped. Pass `manager` to deliver inside the caller's transaction, so a
 * rolled-back action never leaves a notification or mail behind.
 */
@Injectable()
export class NotificationsService {
  private readonly channels: Map<ChannelName, NotificationChannel>;

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @Inject(NOTIFICATION_CHANNELS) channels: NotificationChannel[],
    private readonly dataSource: DataSource,
  ) {
    this.channels = new Map(channels.map((c) => [c.name, c]));
  }

  async notify(
    userIds: string[],
    message: NotificationMessage,
    channels: readonly ChannelName[] = ALL_CHANNELS,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    const recipients: NotificationRecipient[] = await manager
      .getRepository(User)
      .find({
        select: { id: true, nameBn: true, notificationEmail: true },
        where: { id: In(ids), isActive: true },
      });
    for (const name of new Set(channels)) {
      const channel = this.channels.get(name);
      if (!channel)
        throw new Error(`Notification channel ${name} is not registered`);
      await channel.deliver(recipients, message, manager);
    }
  }

  // ---------------------------------------------------------------- the user's own bell

  async listMine(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<PaginatedResponseDto<NotificationResponseDto>> {
    const [rows, total] = await this.notifications.findAndCount({
      where: { userId, ...(query.unread ? { readAt: IsNull() } : {}) },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginated(
      rows.map((n) => this.toResponse(n)),
      total,
      query,
    );
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notifications.countBy({ userId, readAt: IsNull() });
  }

  /** Someone else's notification looks like "not found" (nothing is revealed). */
  async markRead(userId: string, id: string): Promise<NotificationResponseDto> {
    const notification = await this.notifications.findOneBy({ id, userId });
    if (!notification)
      throw new NotFoundException('নোটিফিকেশনটি পাওয়া যায়নি।');
    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notifications.update(
        { id, userId },
        { readAt: notification.readAt },
      );
    }
    return this.toResponse(notification);
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.notifications.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return result.affected ?? 0;
  }

  private toResponse(n: Notification): NotificationResponseDto {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt,
      createdAt: n.createdAt,
    };
  }
}
