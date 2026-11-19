import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import type { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import type { DecisionStorageService } from '../decisions/decision-storage.service';
import { docm, docx } from '../decisions/docx.fixture-spec';
import { MeetingParticipant } from '../meetings/entities/meeting-participant.entity';
import type { Meeting } from '../meetings/entities/meeting.entity';
import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import type { MeetingNoticeFile } from './entities/meeting-notice-file.entity';
import { NOTICE_MESSAGES } from './notices.messages';
import { NoticesService } from './notices.service';

const ID = '22222222-2222-4222-8222-222222222222';
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1');
const PEOPLE = new Set(['org', 'chair', 'mem']);

const actor = (id: string, role = UserRole.OFFICER): AuthUser => ({
  id,
  role,
  mustChangePassword: false,
});

function setup(status = MeetingStatus.SCHEDULED, existing = false) {
  const meeting = { id: ID, organizerId: 'org', chairId: 'chair', status };
  let row: Partial<MeetingNoticeFile> | null = existing
    ? {
        id: 'old',
        meetingId: ID,
        uploadedById: 'org',
        originalName: 'old.pdf',
        storedName: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf',
        mime: 'application/pdf',
        size: 10,
        sha256: 'a'.repeat(64),
      }
    : null;
  const files = {
    findOneBy: jest.fn(() => Promise.resolve(row)),
    findOne: jest.fn(() =>
      Promise.resolve(
        row && {
          ...row,
          createdAt: new Date(),
          uploadedBy: { id: 'org', nameBn: 'ক', nameEn: 'K' },
        },
      ),
    ),
    create: jest.fn((v: object) => v),
    save: jest.fn((v: Partial<MeetingNoticeFile>) => {
      row = { ...v, id: 'new' };
      return Promise.resolve(row);
    }),
    delete: jest.fn(() => {
      row = null;
      return Promise.resolve();
    }),
  };
  const lockedQb = {
    setLock: () => lockedQb,
    where: () => lockedQb,
    getOneOrFail: () => Promise.resolve(meeting),
  };
  const participants = {
    existsBy: jest.fn(({ userId }: { userId: string }) =>
      Promise.resolve(PEOPLE.has(userId)),
    ),
  };
  const manager = {
    getRepository: (entity: { name: string }) =>
      entity.name === 'Meeting'
        ? { createQueryBuilder: () => lockedQb }
        : files,
  };
  const dataSource = {
    getRepository: (entity: unknown) =>
      entity === MeetingParticipant ? participants : files,
    transaction: jest.fn((cb: (m: typeof manager) => Promise<unknown>) =>
      cb(manager),
    ),
  };
  const storage = {
    save: jest.fn(() =>
      Promise.resolve('cccccccc-cccc-4ccc-8ccc-cccccccccccc.docx'),
    ),
    remove: jest.fn(() => Promise.resolve()),
    open: jest.fn(() => 'stream'),
  };
  const audit = { log: jest.fn(() => Promise.resolve()) };
  const service = new NoticesService(
    {
      findOneBy: jest.fn(() => Promise.resolve(meeting)),
    } as unknown as Repository<Meeting>,
    files as unknown as Repository<MeetingNoticeFile>,
    storage as unknown as DecisionStorageService,
    audit as unknown as AuditService,
    dataSource as unknown as DataSource,
  );
  return { service, storage, audit, files };
}

const pdf = { originalname: 'নোটিশ.pdf', size: PDF.length, buffer: PDF };

describe('NoticesService (SPEC.md §6.8, v1.13)', () => {
  it.each([
    ['the chair', actor('chair')],
    ['a member', actor('mem')],
    ['an admin', actor('adm', UserRole.ADMIN)],
  ])(
    '%s cannot upload, replace or remove (403, nothing read or stored)',
    async (_who, who) => {
      const { service, storage, audit } = setup(MeetingStatus.SCHEDULED, true);
      await expect(service.upload(who, ID, pdf, null)).rejects.toThrow(
        new ForbiddenException(NOTICE_MESSAGES.changeForbidden),
      );
      await expect(service.remove(who, ID, null)).rejects.toThrow(
        new ForbiddenException(NOTICE_MESSAGES.changeForbidden),
      );
      expect(storage.save).not.toHaveBeenCalled();
      expect(storage.remove).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    },
  );

  it('a stranger cannot even download (403)', async () => {
    const { service } = setup(MeetingStatus.SCHEDULED, true);
    await expect(service.download(actor('stranger'), ID)).rejects.toThrow(
      new ForbiddenException(NOTICE_MESSAGES.forbidden),
    );
  });

  it('the organizer uploads a DOCX: stored in the notices area, audited as UPLOADED', async () => {
    const { service, storage, audit } = setup();
    const bytes = docx();
    const dto = await service.upload(
      actor('org'),
      ID,
      { originalname: 'notice.docx', size: bytes.length, buffer: bytes },
      null,
    );
    expect(storage.save).toHaveBeenCalledWith(ID, bytes, '.docx', 'notices');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEETING_NOTICE_UPLOADED,
        before: null,
      }),
      expect.anything(),
    );
    expect(dto).toMatchObject({ canManage: true });
  });

  it('a second upload replaces: old row deleted, old bytes removed after commit, audited as REPLACED', async () => {
    const { service, storage, audit, files } = setup(
      MeetingStatus.SCHEDULED,
      true,
    );
    await service.upload(actor('org'), ID, pdf, null);
    expect(files.delete).toHaveBeenCalledWith('old');
    expect(storage.remove).toHaveBeenCalledWith(
      ID,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf',
      'notices',
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEETING_NOTICE_REPLACED,
        before: expect.objectContaining({ name: 'old.pdf' }) as object,
      }),
      expect.anything(),
    );
  });

  it('the organizer removes it: audited as REMOVED; nothing to remove → 404', async () => {
    const { service, audit, storage } = setup(MeetingStatus.SCHEDULED, true);
    await service.remove(actor('org'), ID, null);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.MEETING_NOTICE_REMOVED }),
      expect.anything(),
    );
    expect(storage.remove).toHaveBeenCalled();
    await expect(service.remove(actor('org'), ID, null)).rejects.toThrow(
      new NotFoundException(NOTICE_MESSAGES.notFound),
    );
  });

  it('cancelled meeting: no upload (409), but the file can still be downloaded', async () => {
    const { service } = setup(MeetingStatus.CANCELLED, true);
    await expect(service.upload(actor('org'), ID, pdf, null)).rejects.toThrow(
      new ConflictException(NOTICE_MESSAGES.cancelled),
    );
    await expect(service.download(actor('mem'), ID)).resolves.toMatchObject({
      stream: 'stream',
    });
  });

  it('a macro-enabled Word file is refused with its name', async () => {
    const { service, storage } = setup();
    const bytes = docm();
    await expect(
      service.upload(
        actor('org'),
        ID,
        { originalname: 'notice.docm', size: bytes.length, buffer: bytes },
        null,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(storage.save).not.toHaveBeenCalled();
  });
});
