import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailChannel } from './channels/email.channel';
import { InAppChannel } from './channels/in-app.channel';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
} from './channels/notification-channel';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/** Global: every module notifies users through NotificationsService.notify(). */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationsController],
  providers: [
    InAppChannel,
    EmailChannel,
    // Add a new channel (SMS, WhatsApp) here — business code does not change.
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [InAppChannel, EmailChannel],
      useFactory: (...channels: NotificationChannel[]) => channels,
    },
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
