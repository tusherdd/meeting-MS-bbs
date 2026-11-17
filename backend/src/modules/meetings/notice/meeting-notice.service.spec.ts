import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { AuthUser } from '../../../common/types/auth-user';
import type { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import type { PdfService } from '../../reports/pdf/pdf.service';
import type { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import type { Meeting } from '../entities/meeting.entity';
import { MeetingStatus } from '../enums/meeting-status.enum';
import { ParticipantRole } from '../enums/participant-role.enum';
import { MeetingNoticeService, noticeFilename } from './meeting-notice.service';

const user = (id: string, nameBn: string, priority: number) =>
  ({
    id,
    nameBn,
    designationRemark: null,
    designation: { nameBn: `পদবি ${priority}`, priority },
    wing: { nameBn: 'কম্পিউটার উইং' },
  }) as unknown as User;

const organizer = user('org-1', 'আয়োজক কর্মকর্তা', 6);
const member = user('mem-1', 'সদস্য কর্মকর্তা', 7);

function meeting(over: Partial<Meeting> = {}): Meeting {
  return {
    id: '1a2b3c4d-0000-4000-8000-000000000001',
    title: 'Test',
    agenda: null,
    startAt: new Date('2026-11-20T05:00:00Z'),
    room: 'Room 1',
    onlineLink: null,
    status: MeetingStatus.SCHEDULED,
    chair: null,
    chairId: null,
    participants: [
      {
        userId: organizer.id,
        role: ParticipantRole.ORGANIZER,
        user: organizer,
      },
      { userId: member.id, role: ParticipantRole.MEMBER, user: member },
    ],
    guests: [],
    ...over,
  } as unknown as Meeting;
}

const actor = (id: string, role = UserRole.OFFICER): AuthUser => ({
  id,
  role,
  mustChangePassword: false,
});

function setup(m: Meeting | null) {
  const meetings = { findOne: jest.fn().mockResolvedValue(m) };
  const users = {
    findOneOrFail: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === member.id
          ? member
          : where.id === organizer.id
            ? organizer
            : user(where.id, 'প্রশাসক কর্মকর্তা', 4),
      ),
    ),
  };
  const pdf = { render: jest.fn().mockResolvedValue(Buffer.from('%PDF')) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new MeetingNoticeService(
    meetings as unknown as Repository<Meeting>,
    users as unknown as Repository<User>,
    pdf as unknown as PdfService,
    audit as unknown as AuditService,
  );
  return { service, pdf, audit };
}

describe('MeetingNoticeService permissions', () => {
  it('a non-participant officer gets 403', async () => {
    const { service, pdf } = setup(meeting());
    await expect(
      service.noticePdf(actor('stranger'), 'x', null),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(pdf.render).not.toHaveBeenCalled();
  });

  it('a cancelled meeting is rejected (409)', async () => {
    const { service, pdf } = setup(
      meeting({ status: MeetingStatus.CANCELLED }),
    );
    await expect(
      service.noticePdf(actor(member.id), 'x', null),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(pdf.render).not.toHaveBeenCalled();
  });

  it('an unknown meeting is 404', async () => {
    const { service } = setup(null);
    await expect(
      service.noticePdf(actor(member.id), 'x', null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('an admin who is not a participant may export', async () => {
    const { service, pdf } = setup(meeting());
    await service.noticePdf(actor('admin-1', UserRole.ADMIN), 'x', null);
    expect(pdf.render).toHaveBeenCalledTimes(1);
  });
});

describe('MeetingNoticeService content', () => {
  it('the signature is the EXPORTING user (a plain member here), not the organizer', async () => {
    const { service } = setup(meeting());
    const { input } = await service.buildInput(actor(member.id), 'x');
    expect(input.signer.nameBn).toBe('সদস্য কর্মকর্তা');
    expect(input.signer.designationBn).toBe('পদবি 7');
  });

  it('lists every internal person (organizer included)', async () => {
    const { service } = setup(meeting());
    const { input } = await service.buildInput(actor(member.id), 'x');
    expect(input.officers.map((o) => o.nameBn).sort()).toEqual(
      ['আয়োজক কর্মকর্তা', 'সদস্য কর্মকর্তা'].sort(),
    );
  });

  it('audits MEETING_NOTICE_EXPORTED with the real actor and returns an ASCII file name', async () => {
    const { service, audit } = setup(meeting());
    const file = await service.noticePdf(actor(member.id), 'x', '127.0.0.1');
    expect(file.filename).toBe('meeting-notice-2026-11-20-1a2b3c4d.pdf');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: member.id,
        action: AuditAction.MEETING_NOTICE_EXPORTED,
        entityType: 'meeting',
      }),
    );
  });

  it('file name uses the Dhaka date', () => {
    // 20:00 UTC on 19 Nov = 02:00 on 20 Nov in Dhaka
    expect(
      noticeFilename({
        id: 'abcdef12-3456-4000-8000-000000000000',
        startAt: new Date('2026-11-19T20:00:00Z'),
      }),
    ).toBe('meeting-notice-2026-11-20-abcdef12.pdf');
  });
});
