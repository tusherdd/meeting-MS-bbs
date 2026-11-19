import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import type { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import type { Meeting } from '../meetings/entities/meeting.entity';
import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../meetings/enums/participant-role.enum';
import type { MeetingsService } from '../meetings/meetings.service';
import { ChannelName } from '../notifications/channels/notification-channel';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import type { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '../users/enums/user-role.enum';
import { DecisionStatus } from './decision-rules';
import type { DecisionStorageService } from './decision-storage.service';
import { decisionUploadedNotice, DecisionsService } from './decisions.service';
import type { MeetingDecisionFile } from './entities/meeting-decision-file.entity';

const PDF = Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1');
const ID = '11111111-1111-4111-8111-111111111111';

function meeting(over: Partial<Meeting> = {}): Meeting {
  return {
    id: ID,
    title: 'বাজেট সভা',
    status: MeetingStatus.SCHEDULED,
    startAt: new Date(Date.now() - 3_600_000),
    organizerId: 'org',
    chairId: 'chair',
    participants: [
      { userId: 'org', role: ParticipantRole.ORGANIZER },
      { userId: 'chair', role: ParticipantRole.CHAIR },
      { userId: 'mem', role: ParticipantRole.MEMBER },
    ],
    ...over,
  } as unknown as Meeting;
}

const actor = (id: string, role = UserRole.OFFICER): AuthUser => ({
  id,
  role,
  mustChangePassword: false,
});

function setup(m: Meeting, stored: Partial<MeetingDecisionFile>[] = []) {
  let rows = [...stored] as MeetingDecisionFile[];
  const filesRepo = {
    find: jest.fn(() =>
      Promise.resolve(
        rows.map((r) => ({
          ...r,
          uploadedBy: { id: r.uploadedById, nameBn: 'ক', nameEn: 'K' },
        })),
      ),
    ),
    countBy: jest.fn(() => Promise.resolve(rows.length)),
    findOneBy: jest.fn(({ id }: { id: string }) =>
      Promise.resolve(rows.find((r) => r.id === id) ?? null),
    ),
    create: jest.fn((v: object) => v),
    save: jest.fn((v: MeetingDecisionFile) => {
      const row = { ...v, id: `f${rows.length + 1}` };
      rows.push(row);
      return Promise.resolve(row);
    }),
    delete: jest.fn((id: string) => {
      rows = rows.filter((r) => r.id !== id);
      return Promise.resolve();
    }),
  };
  const lockedQb = {
    setLock: () => lockedQb,
    where: () => lockedQb,
    getOneOrFail: () => Promise.resolve(m),
  };
  const manager = {
    getRepository: (entity: { name: string }) =>
      entity.name === 'Meeting'
        ? { createQueryBuilder: () => lockedQb }
        : filesRepo,
  };
  const dataSource = {
    transaction: jest.fn((cb: (mgr: typeof manager) => Promise<unknown>) =>
      cb(manager),
    ),
  };
  const storage = {
    save: jest.fn(() =>
      Promise.resolve('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf'),
    ),
    remove: jest.fn(() => Promise.resolve()),
  };
  const notifications = { notify: jest.fn(() => Promise.resolve()) };
  const audit = { log: jest.fn(() => Promise.resolve()) };
  const meetingsService = {
    toSummaries: jest.fn((_a: AuthUser, ms: Meeting[]) => Promise.resolve(ms)),
  };
  const service = new DecisionsService(
    {
      findOne: jest.fn(() => Promise.resolve(m)),
    } as unknown as Repository<Meeting>,
    filesRepo as unknown as Repository<MeetingDecisionFile>,
    storage as unknown as DecisionStorageService,
    meetingsService as unknown as MeetingsService,
    notifications as unknown as NotificationsService,
    audit as unknown as AuditService,
    dataSource as unknown as DataSource,
  );
  return { service, storage, notifications, audit, rows: () => rows };
}

const pdfFile = { originalname: 'minutes.pdf', size: PDF.length, buffer: PDF };

describe('DecisionsService permissions', () => {
  it('a non-participant gets 403 for view, upload and delete', async () => {
    const { service } = setup(meeting());
    const stranger = actor('stranger');
    await expect(service.detail(stranger, ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.upload(stranger, ID, [pdfFile], null),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.remove(stranger, ID, 'f1', null),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an admin may view but not upload', async () => {
    const { service } = setup(meeting());
    const admin = actor('admin', UserRole.ADMIN);
    const detail = await service.detail(admin, ID);
    expect(detail.canUpload).toBe(false);
    expect(detail.uploadBlock).toBe('forbidden');
    await expect(
      service.upload(admin, ID, [pdfFile], null),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no upload before the start (409) or for a cancelled meeting (409)', async () => {
    const future = setup(
      meeting({ startAt: new Date(Date.now() + 3_600_000) }),
    );
    await expect(
      future.service.upload(actor('mem'), ID, [pdfFile], null),
    ).rejects.toBeInstanceOf(ConflictException);
    const cancelled = setup(meeting({ status: MeetingStatus.CANCELLED }));
    await expect(
      cancelled.service.upload(actor('mem'), ID, [pdfFile], null),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('a fake PDF is rejected with its name in the message; nothing is stored', async () => {
    const { service, storage } = setup(meeting());
    const fake = {
      originalname: 'fake.pdf',
      size: 9,
      buffer: Buffer.from('not a pdf'),
    };
    await expect(
      service.upload(actor('mem'), ID, [fake], null),
    ).rejects.toThrow(
      new BadRequestException(
        '"fake.pdf" ফাইলটি গ্রহণ করা যায়নি: শুধু PDF, DOCX, JPEG অথবা PNG ফাইল Upload করা যাবে।',
      ),
    );
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('the 11th file is refused', async () => {
    const stored = Array.from({ length: 10 }, (_, i) => ({
      id: `x${i}`,
      uploadedById: 'org',
    }));
    const { service } = setup(meeting(), stored);
    await expect(
      service.upload(actor('mem'), ID, [pdfFile], null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a member cannot delete another person’s file; the organizer can', async () => {
    const { service } = setup(meeting(), [
      { id: 'f1', uploadedById: 'chair', storedName: 'x' },
    ]);
    await expect(
      service.remove(actor('mem'), ID, 'f1', null),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.remove(actor('org'), ID, 'f1', null);
  });
});

describe('DecisionsService upload, notification, delete-last', () => {
  it('a member uploads: stored, audited, organizer + chair notified on the bell only', async () => {
    const { service, notifications, audit, rows } = setup(meeting());
    const detail = await service.upload(
      actor('mem'),
      ID,
      [pdfFile],
      '127.0.0.1',
    );
    expect(rows()).toHaveLength(1);
    expect(detail.status).toBe(DecisionStatus.COMPLETE);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'mem',
        action: AuditAction.MEETING_DECISION_UPLOADED,
      }),
      expect.anything(),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      ['org', 'chair'],
      {
        type: NotificationType.MEETING_DECISION_UPLOADED,
        title: 'সভা কার্যবিবরণী: বাজেট সভা',
        body: '"বাজেট সভা" সভার কার্যবিবরণী আপলোড করা হয়েছে।',
        link: `/meetings/${ID}/decision`,
      },
      [ChannelName.IN_APP],
      expect.anything(),
    );
  });

  it('the uploading organizer is not notified', async () => {
    const { service, notifications } = setup(meeting());
    await service.upload(actor('org'), ID, [pdfFile], null);
    expect((notifications.notify.mock.calls[0] as unknown[])[0]).toEqual([
      'chair',
    ]);
  });

  it('deleting the last file makes the decision Pending again (audited, file removed)', async () => {
    const { service, audit, storage } = setup(meeting(), [
      { id: 'f1', uploadedById: 'mem', storedName: 'stored.pdf' },
    ]);
    expect((await service.detail(actor('mem'), ID)).status).toBe(
      DecisionStatus.COMPLETE,
    );
    await service.remove(actor('mem'), ID, 'f1', null);
    expect(storage.remove).toHaveBeenCalledWith(ID, 'stored.pdf');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEETING_DECISION_DELETED }),
      expect.anything(),
    );
    expect((await service.detail(actor('mem'), ID)).status).toBe(
      DecisionStatus.PENDING,
    );
  });

  it('notice text', () => {
    expect(decisionUploadedNotice({ id: 'x', title: 'T' }).body).toBe(
      '"T" সভার কার্যবিবরণী আপলোড করা হয়েছে।',
    );
  });
});
