import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  QueryFailedError,
  type DataSource,
  type EntityManager,
  type Repository,
} from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import type { EnvVars } from '../../config/env.validation';
import type { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import type { TokenService } from '../auth/token.service';
import { Designation } from '../designations/entities/designation.entity';
import type { MailService } from '../mail/mail.service';
import {
  ChannelName,
  type NotificationMessage,
} from '../notifications/channels/notification-channel';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import type { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CHANGE_REQUEST_MESSAGES as MSG } from './change-requests.messages';
import { ChangeRequestsService } from './change-requests.service';
import { ChangeRequest } from './entities/change-request.entity';
import { ChangeRequestStatus } from './enums/change-request-status.enum';
import { ChangeRequestType } from './enums/change-request-type.enum';

const officer: AuthUser = {
  id: 'officer',
  role: UserRole.OFFICER,
  mustChangePassword: false,
};
const admin: AuthUser = {
  id: 'admin',
  role: UserRole.ADMIN,
  mustChangePassword: false,
};

function storedUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'officer',
    role: UserRole.OFFICER,
    loginEmail: 'old@example.test',
    notificationEmail: 'notify@example.test',
    nameBn: 'অফিসার',
    nameEn: 'Officer',
    designationId: 'd-current',
    designation: {
      id: 'd-current',
      nameBn: 'উপপরিচালক',
      nameEn: 'Deputy Director',
      priority: 6,
    },
    ...overrides,
  });
}

function pendingRequest(overrides: Partial<ChangeRequest> = {}): ChangeRequest {
  return Object.assign(new ChangeRequest(), {
    id: 'cr1',
    userId: 'officer',
    type: ChangeRequestType.LOGIN_EMAIL,
    newValue: { loginEmail: 'new@example.test' },
    status: ChangeRequestStatus.PENDING,
    ...overrides,
  });
}

function setup() {
  const userRepo = {
    findOneOrFail: jest.fn().mockResolvedValue(storedUser()),
    exists: jest.fn().mockResolvedValue(false),
    update: jest.fn(),
    find: jest.fn().mockResolvedValue([
      {
        id: 'admin',
        nameBn: 'প্রশাসক',
        notificationEmail: 'admin@example.test',
      },
    ]),
  };
  const designationRepo = {
    findOneBy: jest
      .fn()
      .mockResolvedValue({ id: 'd-new', nameBn: 'পরিচালক', isActive: true }),
    findBy: jest.fn().mockResolvedValue([]),
  };
  const lockQuery = {
    where: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(pendingRequest()),
  };
  const requestRepo = {
    insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 'cr1' }] }),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => lockQuery),
  };
  const repoFor = (entity: unknown) =>
    entity === User
      ? userRepo
      : entity === Designation
        ? designationRepo
        : requestRepo;
  const manager = { getRepository: jest.fn(repoFor) };
  const dataSource = {
    getRepository: jest.fn(repoFor),
    transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
      Promise.resolve().then(() => cb(manager as unknown as EntityManager)),
    ),
  };
  const requests = {
    exists: jest.fn().mockResolvedValue(false),
    findOne: jest.fn().mockResolvedValue(
      Object.assign(pendingRequest(), {
        user: storedUser(),
        reviewedBy: null,
      }),
    ),
  };
  const tokens = { revokeAllForUser: jest.fn() };
  const notifications = { notify: jest.fn() };
  const audit = { log: jest.fn() };
  const mail = { enqueue: jest.fn() };
  const env: Partial<EnvVars> = { FRONTEND_URL: 'http://localhost:3000' };

  const service = new ChangeRequestsService(
    requests as unknown as Repository<ChangeRequest>,
    tokens as unknown as TokenService,
    notifications as unknown as NotificationsService,
    audit as unknown as AuditService,
    mail as unknown as MailService,
    dataSource as unknown as DataSource,
    { get: (k: keyof EnvVars) => env[k] } as unknown as ConfigService<
      EnvVars,
      true
    >,
  );
  return {
    service,
    userRepo,
    designationRepo,
    requestRepo,
    lockQuery,
    requests,
    tokens,
    notifications,
    audit,
    mail,
  };
}

describe('ChangeRequestsService.create', () => {
  it('LOGIN_EMAIL: stores the request, audits, notifies admins (bell + mail)', async () => {
    const { service, requestRepo, notifications, mail, audit } = setup();
    await service.create(
      officer,
      { type: ChangeRequestType.LOGIN_EMAIL, loginEmail: 'new@example.test' },
      null,
    );
    expect(requestRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ChangeRequestType.LOGIN_EMAIL,
        newValue: { loginEmail: 'new@example.test' },
        status: ChangeRequestStatus.PENDING,
      }),
    );
    // Bell + e-mail to every other active admin, through notify().
    const [adminIds, message, channels] = notifications.notify.mock
      .calls[0] as [string[], NotificationMessage, ChannelName[]];
    expect(adminIds).toEqual(['admin']);
    expect(message).toMatchObject({
      type: NotificationType.CHANGE_REQUEST_SUBMITTED,
      link: '/admin/change-requests/cr1',
    });
    expect(channels).toEqual([ChannelName.IN_APP, ChannelName.EMAIL]);
    const adminMail = message.email!({
      id: 'admin',
      nameBn: 'প্রশাসক',
      notificationEmail: 'admin@example.test',
    });
    expect(adminMail.html).toContain('new@example.test');
    expect(mail.enqueue).not.toHaveBeenCalled(); // no direct mail on submit
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.CHANGE_REQUEST_CREATE }),
      expect.anything(),
    );
  });

  it('rejects an email that another account already uses (409)', async () => {
    const { service, userRepo } = setup();
    userRepo.exists.mockResolvedValue(true);
    await expect(
      service.create(
        officer,
        { type: ChangeRequestType.LOGIN_EMAIL, loginEmail: 'x@y.test' },
        null,
      ),
    ).rejects.toThrow(new ConflictException(MSG.loginEmailTaken));
  });

  it('rejects the same designation and an inactive one (400)', async () => {
    const { service, designationRepo } = setup();
    await expect(
      service.create(
        officer,
        { type: ChangeRequestType.DESIGNATION, designationId: 'd-current' },
        null,
      ),
    ).rejects.toThrow(new BadRequestException(MSG.sameDesignation));
    designationRepo.findOneBy.mockResolvedValue({
      id: 'd-new',
      isActive: false,
    });
    await expect(
      service.create(
        officer,
        { type: ChangeRequestType.DESIGNATION, designationId: 'd-new' },
        null,
      ),
    ).rejects.toThrow(new BadRequestException(MSG.designationInvalid));
  });

  it('only one PENDING request per type: pre-check and race-safe index both give 409', async () => {
    const { service, requests, requestRepo } = setup();
    requests.exists.mockResolvedValue(true);
    await expect(
      service.create(
        officer,
        { type: ChangeRequestType.LOGIN_EMAIL, loginEmail: 'a@b.test' },
        null,
      ),
    ).rejects.toThrow(new ConflictException(MSG.onePending));

    requests.exists.mockResolvedValue(false);
    requestRepo.insert.mockRejectedValue(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('dup'), {
          code: '23505',
          constraint: 'UQ_change_requests_one_pending',
        }),
      ),
    );
    await expect(
      service.create(
        officer,
        { type: ChangeRequestType.LOGIN_EMAIL, loginEmail: 'a@b.test' },
        null,
      ),
    ).rejects.toThrow(new ConflictException(MSG.onePending));
  });

  it('the SUPER_ADMIN cannot file requests', async () => {
    const { service, userRepo } = setup();
    userRepo.findOneOrFail.mockResolvedValue(
      storedUser({ role: UserRole.SUPER_ADMIN }),
    );
    await expect(
      service.create(
        officer,
        { type: ChangeRequestType.LOGIN_EMAIL, loginEmail: 'a@b.test' },
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ChangeRequestsService.approve', () => {
  it('an admin cannot approve their own request (403), nothing changes', async () => {
    const { service, lockQuery, userRepo } = setup();
    lockQuery.getOne.mockResolvedValue(pendingRequest({ userId: 'admin' }));
    await expect(service.approve(admin, 'cr1', {}, null)).rejects.toThrow(
      new ForbiddenException(MSG.ownRequest),
    );
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('LOGIN_EMAIL: applies the change, ends sessions, mails old and new address', async () => {
    const { service, userRepo, tokens, mail, requestRepo, notifications } =
      setup();
    await service.approve(admin, 'cr1', { note: 'ঠিক আছে' }, null);

    expect(userRepo.update).toHaveBeenCalledWith('officer', {
      loginEmail: 'new@example.test',
    });
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith(
      'officer',
      expect.anything(),
    );
    const recipients = (mail.enqueue.mock.calls as Array<[{ to: string }]>).map(
      ([m]) => m.to,
    );
    // Login addresses are mailed directly; the decision goes through notify().
    expect(recipients.sort()).toEqual(['new@example.test', 'old@example.test']);
    expect(requestRepo.update).toHaveBeenCalledWith(
      'cr1',
      expect.objectContaining({
        status: ChangeRequestStatus.APPROVED,
        reviewedById: 'admin',
        reviewNote: 'ঠিক আছে',
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      ['officer'],
      expect.objectContaining({
        type: NotificationType.CHANGE_REQUEST_APPROVED,
      }),
      [ChannelName.IN_APP, ChannelName.EMAIL],
      expect.anything(),
    );
  });

  it('fails (409) if the email was taken meanwhile; request is not decided', async () => {
    const { service, userRepo, requestRepo } = setup();
    userRepo.exists.mockResolvedValue(true);
    await expect(service.approve(admin, 'cr1', {}, null)).rejects.toThrow(
      new ConflictException(MSG.loginEmailTaken),
    );
    expect(userRepo.update).not.toHaveBeenCalled();
    expect(requestRepo.update).not.toHaveBeenCalled();
  });

  it('DESIGNATION: fails (409) if the designation is no longer active', async () => {
    const { service, lockQuery, designationRepo, userRepo } = setup();
    lockQuery.getOne.mockResolvedValue(
      pendingRequest({
        type: ChangeRequestType.DESIGNATION,
        newValue: { designationId: 'd-new' },
      }),
    );
    designationRepo.findOneBy.mockResolvedValue({
      id: 'd-new',
      isActive: false,
    });
    await expect(service.approve(admin, 'cr1', {}, null)).rejects.toThrow(
      new ConflictException(MSG.designationGone),
    );
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('DESIGNATION: applies the new designation', async () => {
    const { service, lockQuery, userRepo, tokens } = setup();
    lockQuery.getOne.mockResolvedValue(
      pendingRequest({
        type: ChangeRequestType.DESIGNATION,
        newValue: { designationId: 'd-new' },
      }),
    );
    await service.approve(admin, 'cr1', {}, null);
    expect(userRepo.update).toHaveBeenCalledWith('officer', {
      designationId: 'd-new',
    });
    expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('an already decided request → 409; unknown → 404', async () => {
    const { service, lockQuery } = setup();
    lockQuery.getOne.mockResolvedValue(
      pendingRequest({ status: ChangeRequestStatus.REJECTED }),
    );
    await expect(service.approve(admin, 'cr1', {}, null)).rejects.toThrow(
      new ConflictException(MSG.notPending),
    );
    lockQuery.getOne.mockResolvedValue(null);
    await expect(
      service.approve(admin, 'cr1', {}, null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ChangeRequestsService.cancel / reject', () => {
  it("cannot cancel someone else's request (404)", async () => {
    const { service, lockQuery } = setup();
    lockQuery.getOne.mockResolvedValue(
      pendingRequest({ userId: 'someone-else' }),
    );
    await expect(service.cancel(officer, 'cr1', null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('cancel sets CANCELLED and audits', async () => {
    const { service, requestRepo, audit } = setup();
    await service.cancel(officer, 'cr1', null);
    expect(requestRepo.update).toHaveBeenCalledWith('cr1', {
      status: ChangeRequestStatus.CANCELLED,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.CHANGE_REQUEST_CANCEL }),
      expect.anything(),
    );
  });

  it('reject stores the note and notifies the officer', async () => {
    const { service, requestRepo, notifications, userRepo } = setup();
    await service.reject(admin, 'cr1', { note: 'কাগজপত্র দিন' }, null);
    expect(requestRepo.update).toHaveBeenCalledWith(
      'cr1',
      expect.objectContaining({
        status: ChangeRequestStatus.REJECTED,
        reviewNote: 'কাগজপত্র দিন',
      }),
    );
    const [userIds, message] = notifications.notify.mock.calls[0] as [
      string[],
      NotificationMessage,
    ];
    expect(userIds).toEqual(['officer']);
    expect(message).toMatchObject({
      type: NotificationType.CHANGE_REQUEST_REJECTED,
      link: '/profile/change-requests',
    });
    expect(message.body).toContain('কাগজপত্র দিন');
    expect(userRepo.update).not.toHaveBeenCalled();
  });
});
