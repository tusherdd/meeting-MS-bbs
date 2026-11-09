import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { EnvVars } from '../../config/env.validation';
import type { MailService } from '../mail/mail.service';
import { EmailChannel } from './channels/email.channel';
import { InAppChannel } from './channels/in-app.channel';
import {
  ChannelName,
  type NotificationRecipient,
} from './channels/notification-channel';
import type { Notification } from './entities/notification.entity';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationsService } from './notifications.service';

const recipients: NotificationRecipient[] = [
  { id: 'u1', nameBn: 'রহিম', notificationEmail: 'rahim@x.test' },
  { id: 'u2', nameBn: 'করিম', notificationEmail: 'karim@x.test' },
];

function setup() {
  const userRepo = { find: jest.fn().mockResolvedValue(recipients) };
  const notificationRepo = { insert: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity: { name: string }) =>
      entity.name === 'User' ? userRepo : notificationRepo,
    ),
  } as unknown as EntityManager;
  const mail = { enqueue: jest.fn() };
  const env: Partial<EnvVars> = { FRONTEND_URL: 'http://localhost:3000/' };
  const config = {
    get: (k: keyof EnvVars) => env[k],
  } as unknown as ConfigService<EnvVars, true>;
  const inApp = new InAppChannel();
  const email = new EmailChannel(mail as unknown as MailService, config);
  const service = new NotificationsService(
    {} as unknown as Repository<Notification>,
    [inApp, email],
    { manager } as unknown as DataSource,
  );
  return { service, userRepo, notificationRepo, mail, manager };
}

const message = {
  type: NotificationType.CHANGE_REQUEST_APPROVED,
  title: 'অনুমোদিত',
  body: 'পরিবর্তনটি কার্যকর করা হয়েছে।',
  link: '/profile/change-requests',
};

describe('NotificationsService.notify', () => {
  it('loads only ACTIVE recipients (deduplicated) and delivers on both channels', async () => {
    const { service, userRepo, notificationRepo, mail } = setup();
    await service.notify(['u1', 'u2', 'u1'], message);

    const [query] = userRepo.find.mock.calls[0] as [
      { where: { isActive: boolean; id: { value: string[] } } },
    ];
    expect(query.where.isActive).toBe(true);
    expect(query.where.id.value).toEqual(['u1', 'u2']);

    expect(notificationRepo.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: 'u1',
        title: 'অনুমোদিত',
        link: '/profile/change-requests',
      }),
      expect.objectContaining({ userId: 'u2' }),
    ]);
    expect(mail.enqueue).toHaveBeenCalledTimes(2);
  });

  it('e-mail goes to the verified notification email; generic mail has an absolute link', async () => {
    const { service, mail } = setup();
    await service.notify(['u1'], message, [ChannelName.EMAIL]);
    const [first] = mail.enqueue.mock.calls[0] as [
      { to: string; html: string; text: string },
    ];
    expect(first.to).toBe('rahim@x.test');
    expect(first.html).toContain(
      'href="http://localhost:3000/profile/change-requests"',
    );
    expect(first.text).toContain('পরিবর্তনটি কার্যকর করা হয়েছে।');
  });

  it('a personalised e-mail builder is called once per recipient', async () => {
    const { service, mail } = setup();
    const email = jest.fn((r: NotificationRecipient) => ({
      subject: `হ্যালো ${r.nameBn}`,
      html: '<p>x</p>',
      text: 'x',
    }));
    await service.notify(['u1', 'u2'], { ...message, email }, [
      ChannelName.EMAIL,
    ]);
    expect(email).toHaveBeenCalledTimes(2);
    expect(
      (mail.enqueue.mock.calls[1] as [{ subject: string }])[0].subject,
    ).toBe('হ্যালো করিম');
  });

  it('e-mail-only messages create no bell notification', async () => {
    const { service, notificationRepo } = setup();
    await service.notify(['u1'], message, [ChannelName.EMAIL]);
    expect(notificationRepo.insert).not.toHaveBeenCalled();
  });

  it('nobody to notify → no queries at all', async () => {
    const { service, userRepo } = setup();
    await service.notify([], message);
    expect(userRepo.find).not.toHaveBeenCalled();
  });
});
