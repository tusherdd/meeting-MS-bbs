import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { validationMessages } from '../../../common/pipes/validation.pipe';
import { MEETING_MESSAGES } from '../meetings.messages';
import {
  CheckConflictsDto,
  CreateMeetingDto,
  UpdateMeetingDto,
} from './meeting-input.dto';

const base = {
  title: 'জরুরি সমন্বয় সভা',
  startAt: '2030-01-01T10:30:00+06:00',
  endAt: '2030-01-01T11:30:00+06:00',
  participantIds: [],
};

async function errorsOf(
  cls: new () => object,
  body: Record<string, unknown>,
): Promise<string[]> {
  const dto = plainToInstance(cls, body);
  return validationMessages(await validate(dto, { whitelist: true }));
}

describe('venue (room) is required (v1.9)', () => {
  describe('create', () => {
    it('accepts a venue and trims it', async () => {
      const dto = plainToInstance(CreateMeetingDto, {
        ...base,
        room: '  সম্মেলন কক্ষ   (কক্ষ নং ৫০১) ',
      });
      expect(await validate(dto)).toEqual([]);
      expect(dto.room).toBe('সম্মেলন কক্ষ (কক্ষ নং ৫০১)');
    });

    it.each([
      ['missing', {}],
      ['null', { room: null }],
      ['empty', { room: '' }],
      ['only spaces', { room: '   ' }],
      ['not text', { room: 501 }],
    ])('%s → exactly one message "স্থান লিখতে হবে।"', async (_, extra) => {
      expect(await errorsOf(CreateMeetingDto, { ...base, ...extra })).toEqual([
        MEETING_MESSAGES.venueRequired,
      ]);
    });

    it('keeps the 100 character limit', async () => {
      expect(
        await errorsOf(CreateMeetingDto, { ...base, room: 'ক'.repeat(100) }),
      ).toEqual([]);
      expect(
        await errorsOf(CreateMeetingDto, { ...base, room: 'ক'.repeat(101) }),
      ).toEqual([MEETING_MESSAGES.venueTooLong]);
    });
  });

  describe('edit (PATCH)', () => {
    it('may leave the venue out (it stays as stored)', async () => {
      expect(
        await errorsOf(UpdateMeetingDto, { title: 'নতুন শিরোনাম' }),
      ).toEqual([]);
    });

    it('accepts a new venue', async () => {
      expect(await errorsOf(UpdateMeetingDto, { room: 'অনলাইন' })).toEqual([]);
    });

    it.each([
      ['null', null],
      ['empty', ''],
      ['only spaces', '  '],
    ])('cannot clear the venue (%s)', async (_, room) => {
      expect(await errorsOf(UpdateMeetingDto, { room })).toEqual([
        MEETING_MESSAGES.venueRequired,
      ]);
    });

    it('keeps the 100 character limit', async () => {
      expect(
        await errorsOf(UpdateMeetingDto, { room: 'ক'.repeat(101) }),
      ).toEqual([MEETING_MESSAGES.venueTooLong]);
    });
  });

  describe('live conflict check', () => {
    it('does not need a venue (it is not part of the check)', async () => {
      expect(await errorsOf(CheckConflictsDto, base)).toEqual([]);
      expect(
        await errorsOf(CheckConflictsDto, { ...base, room: null }),
      ).toEqual([]);
    });
  });
});

describe('v1.19: minutesRequired is an optional boolean', () => {
  const withRoom = { ...base, room: 'সম্মেলন কক্ষ' };

  it.each([[true], [false]])('create accepts %s', async (value) => {
    expect(
      await errorsOf(CreateMeetingDto, { ...withRoom, minutesRequired: value }),
    ).toEqual([]);
  });

  it('may be left out (default true in the service)', async () => {
    expect(await errorsOf(CreateMeetingDto, withRoom)).toEqual([]);
    expect(await errorsOf(UpdateMeetingDto, {})).toEqual([]);
  });

  it.each([['yes'], [1]])('not a boolean (%p) → 400 message', async (value) => {
    expect(
      await errorsOf(UpdateMeetingDto, { minutesRequired: value }),
    ).toEqual(['minutesRequired true অথবা false হতে হবে।']);
  });

  it('is not part of the live conflict check', async () => {
    const dto = plainToInstance(CheckConflictsDto, {
      ...base,
      minutesRequired: false,
    });
    await validate(dto, { whitelist: true });
    expect('minutesRequired' in dto).toBe(false);
  });
});
