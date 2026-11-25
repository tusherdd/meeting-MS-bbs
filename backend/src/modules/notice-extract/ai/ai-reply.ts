import { DateTime } from 'luxon';
import { normalizeBangla } from '../../../common/utils/bangla';
import { toAsciiDigits } from '../../../common/utils/digits';
import { DHAKA_TZ } from '../../../common/utils/time';
import type {
  ExtractWarning,
  NoticeExtraction,
  ParticipantLine,
} from '../notice-extract.types';
import { defaultEndTime } from '../parse/notice-time';
import { warning } from '../parse/notice-warnings';
import { NoticeAiReplySchema, type NoticeAiReply } from './notice-ai-schema';

/**
 * The AI's reply → the same NoticeExtraction the OCR extractor returns (v1.21 part 2, SPEC.md
 * §6.12). Pure. The reply is validated with zod; a value in the wrong format becomes null (never
 * repaired by guessing). endTime is always recomputed here (start + 45 min, Asia/Dhaka).
 */

export class AiReplyInvalidError extends Error {
  constructor() {
    super('AI reply invalid');
    this.name = 'AiReplyInvalidError';
  }
}

/** JSON text → validated reply; throws AiReplyInvalidError on broken JSON or a wrong shape. */
export function parseAiReply(raw: string): NoticeAiReply {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AiReplyInvalidError();
  }
  const result = NoticeAiReplySchema.safeParse(json);
  if (!result.success) throw new AiReplyInvalidError();
  return result.data;
}

function clean(value: string | null): string | null {
  if (value === null) return null;
  const text = normalizeBangla(value)
    .replace(/[ \t\u00a0]+/g, ' ')
    .trim();
  return text || null;
}

/** Keeps the agenda's line breaks, cleans each line. */
function cleanAgenda(value: string | null): string | null {
  if (value === null) return null;
  const lines = normalizeBangla(value)
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
}

function validDate(value: string | null): string | null {
  if (value === null) return null;
  const v = toAsciiDigits(value.trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return DateTime.fromISO(v, { zone: DHAKA_TZ }).isValid ? v : null;
}

function validTime(value: string | null): string | null {
  if (value === null) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(toAsciiDigits(value.trim()));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function participant(
  p: NoticeAiReply['distribution'][number],
): ParticipantLine | null {
  const name = p.isGroup ? null : clean(p.name);
  const designation = p.isGroup ? null : clean(p.designation);
  const wing = clean(p.wingOrOffice);
  // The matcher always works on the whole line (SPEC.md §6.12), so rebuild it from the parts.
  const text = [name, designation, wing].filter(Boolean).join(', ');
  if (text.length <= 1) return null;
  return { text, name, designation, wing, isGroup: p.isGroup };
}

export function aiReplyToExtraction(reply: NoticeAiReply): NoticeExtraction {
  const title = clean(reply.title);
  const date = validDate(reply.date);
  const startTime = validTime(reply.startTime);
  const venue = clean(reply.venue);
  const agenda = cleanAgenda(reply.agenda);
  const chairText = clean(reply.chairText);
  const participants = reply.distribution
    .map(participant)
    .filter((p): p is ParticipantLine => p !== null);

  const warnings: ExtractWarning[] = [];
  if (!title) warnings.push(warning('TITLE_NOT_FOUND'));
  if (!date) warnings.push(warning('DATE_NOT_FOUND'));
  if (!startTime) warnings.push(warning('TIME_NOT_FOUND'));
  if (startTime && reply.startTimeAssumedAfternoon)
    warnings.push(warning('TIME_ASSUMED_AFTERNOON'));
  if (!venue) warnings.push(warning('VENUE_NOT_FOUND'));
  if (!agenda) warnings.push(warning('AGENDA_NOT_FOUND'));
  if (!chairText) warnings.push(warning('CHAIR_NOT_FOUND'));
  if (participants.length === 0)
    warnings.push(warning('DISTRIBUTION_NOT_FOUND'));

  return {
    method: 'AI',
    fields: {
      title,
      date,
      startTime,
      endTime: defaultEndTime(date, startTime),
      venue,
      agenda,
    },
    chairText,
    participants,
    warnings,
  };
}
