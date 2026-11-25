import {
  aiReplyToExtraction,
  AiReplyInvalidError,
  parseAiReply,
} from './ai-reply';
import type { NoticeAiReply } from './notice-ai-schema';

/** v1.21 part 2: validating the AI reply and turning it into the extraction. Pure. */

const BASE: NoticeAiReply = {
  title: 'সভা',
  date: '2026-11-10',
  startTime: '14:00',
  endTime: '99:99',
  startTimeAssumedAfternoon: false,
  venue: 'সম্মেলন কক্ষ',
  agenda: 'ক) এক\n\n খ) দুই ',
  chairText: 'জনাব করিম, পরিচালক',
  distribution: [],
};

describe('parseAiReply', () => {
  it('rejects broken JSON and a wrong shape', () => {
    expect(() => parseAiReply('nope')).toThrow(AiReplyInvalidError);
    expect(() => parseAiReply('{"title": 1}')).toThrow(AiReplyInvalidError);
  });

  it('accepts a valid reply', () => {
    expect(parseAiReply(JSON.stringify(BASE)).title).toBe('সভা');
  });
});

describe('aiReplyToExtraction', () => {
  it('recomputes the end as start + 45 min and keeps agenda lines', () => {
    const e = aiReplyToExtraction(BASE);
    expect(e.fields.endTime).toBe('14:45');
    expect(e.fields.agenda).toBe('ক) এক\nখ) দুই');
    expect(e.method).toBe('AI');
  });

  it('turns a wrong date or time format into null with a warning (no guessing)', () => {
    const e = aiReplyToExtraction({
      ...BASE,
      date: '10 November 2026',
      startTime: '2 pm',
    });
    expect(e.fields.date).toBeNull();
    expect(e.fields.startTime).toBeNull();
    expect(e.fields.endTime).toBeNull();
    const codes = e.warnings.map((w) => w.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'DATE_NOT_FOUND',
        'TIME_NOT_FOUND',
        'DISTRIBUTION_NOT_FOUND',
      ]),
    );
  });

  it('rejects an impossible date', () => {
    expect(
      aiReplyToExtraction({ ...BASE, date: '2026-11-31' }).fields.date,
    ).toBeNull();
  });

  it('reports the afternoon assumption only with a time', () => {
    const e = aiReplyToExtraction({
      ...BASE,
      startTimeAssumedAfternoon: true,
    });
    expect(e.warnings.map((w) => w.code)).toContain('TIME_ASSUMED_AFTERNOON');
  });

  it('builds the whole line for matching; groups have no name', () => {
    const e = aiReplyToExtraction({
      ...BASE,
      distribution: [
        {
          name: 'রহিম আলী',
          designation: 'উপপরিচালক',
          wingOrOffice: null,
          isGroup: false,
        },
        {
          name: 'ভুল',
          designation: 'ভুল',
          wingOrOffice: 'আইসিটি উইং',
          isGroup: true,
        },
        { name: null, designation: null, wingOrOffice: null, isGroup: false },
      ],
    });
    expect(e.participants).toEqual([
      {
        text: 'রহিম আলী, উপপরিচালক',
        name: 'রহিম আলী',
        designation: 'উপপরিচালক',
        wing: null,
        isGroup: false,
      },
      {
        text: 'আইসিটি উইং',
        name: null,
        designation: null,
        wing: 'আইসিটি উইং',
        isGroup: true,
      },
    ]);
  });
});
