import type {
  ExtractedFields,
  ExtractWarning,
  ParticipantLine,
} from '../notice-extract.types';
import { parseNoticeDateTime } from './notice-time';
import { applyOcrFixes } from './ocr-fixes';
import { warning } from './notice-warnings';

/**
 * Parser of our ONE fixed notice format (v1.21, SPEC.md §6.12). Pure: text in, fields out.
 *
 * Read: the title paragraph after "সভার নোটিশ" up to "একটি সভা…", the labelled lines
 * "সভাপতি", "তারিখ ও সময়" (or "তারিখ" + "সময়"), "স্থান", "আলোচ্যসূচি", and the numbered
 * "বিতরণ" list. Ignored: the header, the memo number, the date at the top right, the signature
 * block, and everything from "অনুলিপি" on. Labels may have extra spaces and ":" / "ঃ" variants.
 * A field that is not found is null — never guessed.
 */

export interface ParsedNotice {
  fields: ExtractedFields;
  chairText: string | null;
  participants: ParticipantLine[];
  warnings: ExtractWarning[];
}

const COLON = '(?::|ঃ|：)';

type Label = 'chair' | 'dateTime' | 'date' | 'time' | 'venue' | 'agenda';

/** Line-start labels (OCR may split words or add spaces before the colon). */
const LABELS: ReadonlyArray<readonly [Label, RegExp]> = [
  ['chair', new RegExp(`^সভা\\s*পতি\\s*${COLON}+\\s*`, 'u')],
  [
    'dateTime',
    new RegExp(`^তারিখ\\s*(?:ও|এবং|/)\\s*সময়\\s*${COLON}+\\s*`, 'u'),
  ],
  ['date', new RegExp(`^তারিখ\\s*${COLON}+\\s*`, 'u')],
  ['time', new RegExp(`^সময়\\s*${COLON}+\\s*`, 'u')],
  ['venue', new RegExp(`^(?:সভা\\s*)?স্থান\\s*${COLON}+\\s*`, 'u')],
  [
    'agenda',
    new RegExp(`^আলোচ্য\\s*(?:সূচি|সূচী|বিষয়)\\s*${COLON}+\\s*`, 'u'),
  ],
];

/** "২। সভায় …": a numbered paragraph of the body ends the labelled block. */
const BODY_PARAGRAPH = /^[০-৯0-9]{1,2}\s*।/u;
const DISTRIBUTION = /^বিতরণ/u;
const COPY_TO = /^অনুলিপি/u;
/** A numbered list item "১.", "১)", "(১)", "১।". */
const LIST_ITEM = /^\(?([০-৯0-9]{1,2})\s*[.)।:]\s*(.*)$/u;
/** An agenda item "ক)", "(খ)", "১)" — kept on its own line. */
const AGENDA_ITEM = /^\(?[কখগঘঙচছজঝঞটঠণতথদধনপফবভমযরলশসহ০-৯0-9]{1,2}\)/u;
/** Contact lines of the signature block (never part of a list item). */
const CONTACT = /@|ফোন|মোবাইল|ই-?মেইল|e-?mail|tel|fax|ফ্যাক্স/iu;

/** Parentheses that are notes, not part of the person ("(বিশেষ আমন্ত্রণে)", "(জ্যেষ্ঠতার ক্রমানুসারে নয়)"). */
const NOTE_PARENS =
  /\s*\([^()]*(?:আমন্ত্রণ|অনুরোধ|জ্ঞাতার্থে|কার্যার্থে|ক্রমানুসারে|প্রযোজ্য)[^()]*\)/gu;

function collapse(text: string): string {
  return text.replace(/[ \t\u00a0]+/g, ' ').trim();
}

function lineLabel(line: string): readonly [Label, string] | null {
  for (const [label, re] of LABELS) {
    const m = re.exec(line);
    if (m) return [label, line.slice(m[0].length)];
  }
  return null;
}

function trimEnd(text: string): string {
  return text.replace(/[\s।;,:\-–]+$/u, '').trim();
}

interface LabelledBlock {
  label: Label;
  lines: string[];
}

/** The labelled blocks between the title and the distribution list. */
function labelledBlocks(lines: string[]): LabelledBlock[] {
  const blocks: LabelledBlock[] = [];
  let current: LabelledBlock | null = null;
  for (const line of lines) {
    if (DISTRIBUTION.test(line) || COPY_TO.test(line)) break;
    const hit = lineLabel(line);
    if (hit) {
      current = { label: hit[0], lines: hit[1] ? [hit[1]] : [] };
      blocks.push(current);
      continue;
    }
    if (BODY_PARAGRAPH.test(line)) {
      current = null;
      continue;
    }
    current?.lines.push(line);
  }
  return blocks;
}

function joinAgenda(lines: string[]): string | null {
  const out: string[] = [];
  for (const raw of lines) {
    const line = collapse(raw);
    if (!line) continue;
    if (out.length === 0 || AGENDA_ITEM.test(line)) out.push(line);
    else out[out.length - 1] = `${out[out.length - 1]} ${line}`;
  }
  const text = out.join('\n').trim();
  return text || null;
}

const TITLE_PREFIX = /^.{0,120}?কর্তৃক\s+বাস্তবায়নাধীন\s+/u;
const TITLE_END = /^(.*?)\s*একটি\s+((?:জরুরি\s+|বিশেষ\s+)?সভা)/u;
const TITLE_END_ALT = /^(.*?সভা)\s+(?:নিম্নবর্ণিত|আগামী|অনুষ্ঠিত)/u;
const HEADING = /নোটিশ/u;

function parseTitle(lines: string[]): string | null {
  const heading = lines.findIndex((l) => HEADING.test(l));
  if (heading < 0) return null;
  const parts: string[] = [];
  for (const line of lines.slice(heading + 1, heading + 6)) {
    if (lineLabel(line) || DISTRIBUTION.test(line)) break;
    parts.push(line);
    const text = collapse(parts.join(' '));
    const end = TITLE_END.exec(text) ?? TITLE_END_ALT.exec(text);
    if (end) {
      const tail = end[2] ? ` ${end[2]}` : '';
      const title = collapse(
        `${end[1].replace(TITLE_PREFIX, '')}${tail}`,
      ).replace(/^[\s,:;-]+/u, '');
      return title || null;
    }
  }
  return null;
}

/** BBS address parts that are never the wing (they follow the wing in every line). SID stays: it is an office. */
const ADDRESS =
  /^(?:বিবিএস|বাংলাদেশ\s+পরিসংখ্যান\s+ব্যুরো|আগারগাঁও|ঢাকা|শের-?ই-?বাংলা\s*নগর|পরিসংখ্যান\s+ভবন|ই-?২৭\/এ)/u;
/** Name prefixes (several may follow each other: "জনাব ড."). */
const HONORIFIC =
  /^(?:জনাবা|জনাব|বেগম|মিসেস|ড\s*\.|ডঃ|ডা\s*\.|ডক্টর|প্রফেসর|অধ্যাপক)\s*/u;
/** A name may also start directly with "মোঃ" / "মো." / "মোহাম্মদ". */
const NAME_START = /^(?:মোঃ|মো\s*[.:]|মুঃ|মোহাম্মদ|মুহাম্মদ)/u;
const GROUP =
  /\(\s*সকল\s*\)|সকল\s+কর্মকর্তা|কর্মকর্তাবৃন্দ|সংশ্লিষ্ট\s+সকল|সকল\s+(?:উপ|সহকারী)?পরিচালক/u;

/** Latin letters as written in Bangla names ("এ, কে, এম", "এইচ, এম"). */
const INITIALS = new Set(
  [
    'এ',
    'বি',
    'সি',
    'ডি',
    'ই',
    'এফ',
    'জি',
    'এইচ',
    'আই',
    'জে',
    'কে',
    'এল',
    'এম',
    'এন',
    'ও',
    'পি',
    'কিউ',
    'আর',
    'এস',
    'টি',
    'ইউ',
    'ভি',
    'ডব্লিউ',
    'এক্স',
    'জেড',
  ].map((s) => applyOcrFixes(s)),
);

/** True when a comma segment consists of initials only ("এইচ", "এ.কে", "A. K"). */
export function isInitials(segment: string): boolean {
  const tokens = segment.split(/[\s.]+/u).filter(Boolean);
  return (
    tokens.length > 0 &&
    tokens.every((t) => INITIALS.has(t) || /^[A-Za-z]$/.test(t))
  );
}

/**
 * One cleaned distribution line → name / designation / wing (for display and "add as guest";
 * the officer matching itself always uses the WHOLE line, SPEC.md §6.12).
 */
export function parseParticipantLine(text: string): ParticipantLine {
  const isGroup = GROUP.test(text);
  let rest = text;
  let hasName = false;
  for (let m = HONORIFIC.exec(rest); m; m = HONORIFIC.exec(rest)) {
    rest = rest.slice(m[0].length);
    hasName = true;
  }
  if (NAME_START.test(rest)) hasName = true;
  const segments = rest
    .split(/\s*,\s*/u)
    .map((s) => s.trim())
    .filter(Boolean);

  let i = 0;
  let name: string | null = null;
  if (hasName && !isGroup && segments.length > 0) {
    const nameParts = [segments[0]];
    i = 1;
    // Initials written with commas ("এইচ, এম, ফিরোজ") belong to the name.
    while (
      i < segments.length - 1 &&
      isInitials(nameParts[nameParts.length - 1])
    ) {
      nameParts.push(segments[i]);
      i++;
    }
    name = nameParts.join(', ');
  }
  const designation = !isGroup && segments[i] ? segments[i] : null;
  const wingSeg = segments[isGroup ? 1 : i + 1];
  const wing = wingSeg && !ADDRESS.test(wingSeg) ? wingSeg : null;
  return { text, name, designation, wing, isGroup };
}

function cleanItem(text: string): string {
  return trimEnd(collapse(text.replace(NOTE_PARENS, '')));
}

function parseDistribution(lines: string[]): ParticipantLine[] | null {
  const start = lines.findIndex((l) => DISTRIBUTION.test(l));
  if (start < 0) return null;
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = LIST_ITEM.exec(line);
    if (m) {
      items.push(m[2]);
    } else if (items.length > 0 && !CONTACT.test(line)) {
      items[items.length - 1] = `${items[items.length - 1]} ${line}`;
    }
  }
  return items
    .map(cleanItem)
    .filter((t) => t.length > 1)
    .map(parseParticipantLine);
}

/** Splits, normalizes and cuts the text at "অনুলিপি". */
export function noticeLines(raw: string): string[] {
  const lines = applyOcrFixes(raw).split(/\r?\n/).map(collapse).filter(Boolean);
  const cut = lines.findIndex((l) => COPY_TO.test(l));
  return cut >= 0 ? lines.slice(0, cut) : lines;
}

export function parseNotice(raw: string): ParsedNotice {
  const lines = noticeLines(raw);
  const warnings: ExtractWarning[] = [];
  // Labels only below the heading: the date at the top right ("তারিখ: …") is not the meeting date.
  const heading = lines.findIndex((l) => HEADING.test(l));
  const blocks = labelledBlocks(
    heading >= 0 ? lines.slice(heading + 1) : lines,
  );
  const value = (label: Label): string | null => {
    const block = blocks.find((b) => b.label === label);
    if (!block) return null;
    const text = trimEnd(collapse(block.lines.join(' ')));
    return text || null;
  };

  const title = parseTitle(lines);
  const chairText = value('chair');
  const dateTimeText =
    value('dateTime') ??
    ([value('date'), value('time')].filter(Boolean).join('; ') || null);
  const dt = dateTimeText ? parseNoticeDateTime(dateTimeText) : null;
  const venue = value('venue');
  const agendaBlock = blocks.find((b) => b.label === 'agenda');
  const agenda = agendaBlock
    ? (() => {
        const text = joinAgenda(agendaBlock.lines);
        return text ? trimEnd(text) : null;
      })()
    : null;
  const participants = parseDistribution(lines);

  if (!title) warnings.push(warning('TITLE_NOT_FOUND'));
  if (!dt?.date) warnings.push(warning('DATE_NOT_FOUND'));
  if (!dt?.startTime) warnings.push(warning('TIME_NOT_FOUND'));
  if (dt?.assumedAfternoon) warnings.push(warning('TIME_ASSUMED_AFTERNOON'));
  if (!venue) warnings.push(warning('VENUE_NOT_FOUND'));
  if (!agenda) warnings.push(warning('AGENDA_NOT_FOUND'));
  if (!chairText) warnings.push(warning('CHAIR_NOT_FOUND'));
  if (!participants) warnings.push(warning('DISTRIBUTION_NOT_FOUND'));

  return {
    fields: {
      title,
      date: dt?.date ?? null,
      startTime: dt?.startTime ?? null,
      endTime: dt?.endTime ?? null,
      venue,
      agenda,
    },
    chairText,
    participants: participants ?? [],
    warnings,
  };
}
