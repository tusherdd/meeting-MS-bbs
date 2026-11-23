import {
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
import { DECISION_MESSAGES } from '../decisions/decisions.messages';
import { MeetingParticipant } from '../meetings/entities/meeting-participant.entity';
import type { Meeting } from '../meetings/entities/meeting.entity';
import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { ATTACHMENT_MESSAGES as MSG } from './attachments.messages';
import { AttachmentsService } from './attachments.service';
import type { MeetingAttachment } from './entities/meeting-attachment.entity';

const ID = '22222222-2222-4222-8222-222222222222';
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1');
const PEOPLE = new Set(['org', 'chair', 'mem']);

const actor = (id: string, role = UserRole.OFFICER): AuthUser => ({
  id,
  role,
  mustChangePassword: false,
});

function row(n: number): Partial<MeetingAttachment> {
  return {
    id: `a${n}`,
    meetingId: ID,
    uploadedById: 'org',
    name: `সংযুক্তি ${n}`,
    originalName: `file-${n}.pdf`,
    storedName: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf',
    mime: 'application/pdf',
    size: 10,
    sha256: 'a'.repeat(64),
    createdAt: new Date(),
  };
}

function setup(status = MeetingStatus.SCHEDULED, existing = 0) {
  const meeting = { id: ID, organizerId: 'org', chairId: 'chair', status };
  let rows = Array.from({ length: existing }, (_, i) => row(i + 1));
  const files = {
    find: jest.fn(() => Promise.resolve(rows)),
    findOneBy: jest.fn(({ id }: { id: string }) =>
      Promise.resolve(rows.find((r) => r.id === id) ?? null),
    ),
    countBy: jest.fn(() => Promise.resolve(rows.length)),
    create: jest.fn((v: object) => v),
    save: jest.fn((v: Partial<MeetingAttachment>) => {
      const saved = { ...v, id: 'new', createdAt: new Date() };
      rows = [...rows, saved];
      return Promise.resolve(saved);
    }),
    delete: jest.fn((id: string) => {
      rows = rows.filter((r) => r.id !== id);
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
      Promise.resolve('cccccccc-cccc-4ccc-8ccc-cccccccccccc.pdf'),
    ),
    remove: jest.fn(() => Promise.resolve()),
    open: jest.fn(() => 'stream'),
  };
  const audit = { log: jest.fn(() => Promise.resolve()) };
  const service = new AttachmentsService(
    {
      findOneBy: jest.fn(() => Promise.resolve(meeting)),
    } as unknown as Repository<Meeting>,
    files as unknown as Repository<MeetingAttachment>,
    storage as unknown as DecisionStorageService,
    audit as unknown as AuditService,
    dataSource as unknown as DataSource,
  );
  return { service, storage, audit, files };
}

const pdf = { originalname: 'বাজেট.pdf', size: PDF.length, buffer: PDF };

describe('AttachmentsService (SPEC.md §6.11, v1.17)', () => {
  it.each([
    ['the chair', actor('chair')],
    ['a member', actor('mem')],
    ['an admin', actor('adm', UserRole.ADMIN)],
  ])(
    '%s cannot add or remove (403, nothing read or stored)',
    async (_who, who) => {
      const { service, storage, audit } = setup(MeetingStatus.SCHEDULED, 1);
      await expect(service.upload(who, ID, 'নাম', pdf, null)).rejects.toThrow(
        new ForbiddenException(MSG.changeForbidden),
      );
      await expect(service.remove(who, ID, 'a1', null)).rejects.toThrow(
        new ForbiddenException(MSG.changeForbidden),
      );
      expect(storage.save).not.toHaveBeenCalled();
      expect(storage.remove).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    },
  );

  it('a stranger cannot list or download (403); people and admins can', async () => {
    const { service } = setup(MeetingStatus.SCHEDULED, 1);
    await expect(service.list(actor('stranger'), ID)).rejects.toThrow(
      new ForbiddenException(MSG.forbidden),
    );
    await expect(service.download(actor('stranger'), ID, 'a1')).rejects.toThrow(
      new ForbiddenException(MSG.forbidden),
    );
    await expect(service.list(actor('mem'), ID)).resolves.toMatchObject({
      canManage: false,
      max: 5,
    });
    await expect(
      service.list(actor('adm', UserRole.ADMIN), ID),
    ).resolves.toMatchObject({ canManage: false });
    await expect(service.list(actor('org'), ID)).resolves.toMatchObject({
      canManage: true,
    });
  });

  it('the organizer adds a DOCX: stored in the attachments area with the label, audited as ADDED', async () => {
    const { service, storage, audit } = setup();
    const bytes = docx();
    const dto = await service.upload(
      actor('org'),
      ID,
      'বাজেট প্রস্তাব',
      { originalname: 'budget.docx', size: bytes.length, buffer: bytes },
      null,
    );
    expect(storage.save).toHaveBeenCalledWith(
      ID,
      bytes,
      '.docx',
      'attachments',
    );
    expect(dto).toMatchObject({
      name: 'বাজেট প্রস্তাব',
      originalName: 'budget.docx',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEETING_ATTACHMENT_ADDED,
        after: expect.objectContaining({ label: 'বাজেট প্রস্তাব' }) as object,
      }),
      expect.anything(),
    );
  });

  it('a macro-enabled Word file is refused (400), nothing stored', async () => {
    const { service, storage } = setup();
    const bytes = docm();
    await expect(
      service.upload(
        actor('org'),
        ID,
        'নাম',
        { originalname: 'm.docx', size: bytes.length, buffer: bytes },
        null,
      ),
    ).rejects.toThrow(DECISION_MESSAGES.macro('m.docx'));
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('the 6th file is refused (409), nothing read or stored', async () => {
    const { service, storage } = setup(MeetingStatus.SCHEDULED, 5);
    await expect(
      service.upload(actor('org'), ID, 'নাম', pdf, null),
    ).rejects.toThrow(new ConflictException(MSG.tooMany));
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('cancelled meeting: no add or remove (409), but list and download still work', async () => {
    const { service } = setup(MeetingStatus.CANCELLED, 1);
    await expect(
      service.upload(actor('org'), ID, 'নাম', pdf, null),
    ).rejects.toThrow(new ConflictException(MSG.cancelled));
    await expect(service.remove(actor('org'), ID, 'a1', null)).rejects.toThrow(
      new ConflictException(MSG.cancelled),
    );
    await expect(
      service.download(actor('mem'), ID, 'a1'),
    ).resolves.toMatchObject({
      stream: 'stream',
    });
  });

  it('the organizer removes one: audited as REMOVED, bytes removed; unknown id → 404', async () => {
    const { service, audit, storage } = setup(MeetingStatus.SCHEDULED, 2);
    await service.remove(actor('org'), ID, 'a1', null);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEETING_ATTACHMENT_REMOVED,
      }),
      expect.anything(),
    );
    expect(storage.remove).toHaveBeenCalledWith(
      ID,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf',
      'attachments',
    );
    await expect(service.remove(actor('org'), ID, 'a1', null)).rejects.toThrow(
      new NotFoundException(MSG.notFound),
    );
  });
});
