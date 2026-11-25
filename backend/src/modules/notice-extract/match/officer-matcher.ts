import { applyOcrFixes } from '../parse/ocr-fixes';
import { similarity } from './similarity';

/**
 * Matches the people of a notice (distribution lines, the chair) to our officers (v1.21,
 * SPEC.md §6.12). Pure: the caller passes the officer list (active, never SUPER_ADMIN); it is never
 * sent anywhere.
 *
 * - Normalization: "জনাব" / "বেগম" / "ড." etc. removed; "মোঃ" / "মো:" / "মুঃ" / "মোহাম্মদ" /
 *   "মুহাম্মদ" are one token "মো" and then ignored (written or not); normalizeBangla + the OCR fixes;
 *   punctuation → space; spaces collapsed.
 * - Names are compared with the WHOLE line, never with comma-split parts: the line's first tokens
 *   (window of the name's length ± 1, joined without spaces) against the officer's name joined the
 *   same way — so "এইচ, এম, ফিরোজ" equals "এইচ.এম. ফিরোজ" and "এইচএম ফিরোজ".
 * - Score = name similarity (Levenshtein ratio) + 0.10 when a designation of the officer (main or
 *   structured additional charge) is in the line + 0.05 for the wing.
 * - Lines without a name: designation (+ wing when the line names one) only, and only when
 *   exactly ONE officer fits. Group lines ("কর্মকর্তা (সকল)") are never matched.
 */

export interface NamedRef {
  id: string;
  nameBn: string;
  nameEn: string;
}

export interface OfficerRecord {
  id: string;
  nameBn: string;
  nameEn: string;
  designation: NamedRef | null;
  wing: NamedRef | null;
  /** Structured additional charges (v1.16); a charge without a wing uses the officer's wing. */
  charges: ReadonlyArray<{ designation: NamedRef; wing: NamedRef | null }>;
}

export interface MatchCandidate {
  officer: OfficerRecord;
  /** Name similarity 0..1 (1 for a designation-only match). */
  nameScore: number;
  /** nameScore + boosts; used for ranking. */
  score: number;
  designationMatch: boolean;
  wingMatch: boolean;
}

export type UnmatchedReason = 'group' | 'not-found' | 'ambiguous';

export type LineMatch =
  | { status: 'sure'; candidate: MatchCandidate }
  | { status: 'maybe'; candidates: MatchCandidate[] }
  | { status: 'unmatched'; reason: UnmatchedReason };

/** A sure name match: at least this similarity … */
export const SURE_NAME_SCORE = 0.9;
/** … or at least this with a matching designation. */
export const SURE_NAME_WITH_DESIGNATION = 0.8;
/** The best must lead the second by this much (combined score) to be sure. */
export const SURE_MARGIN = 0.08;
/** Below this a name is not offered as "maybe". */
export const MAYBE_NAME_SCORE = 0.6;
export const MAX_MAYBE = 3;
const DESIGNATION_BOOST = 0.1;
const WING_BOOST = 0.05;
/** A name found one token later than the line start (stray OCR token) counts a little less. */
const OFFSET_PENALTY = 0.05;

const HONORIFICS = new Set(
  [
    'জনাব',
    'জনাবা',
    'বেগম',
    'মিসেস',
    'ড',
    'ডঃ',
    'ডা',
    'ডক্টর',
    'প্রফেসর',
    'অধ্যাপক',
    'dr',
    'mr',
    'mrs',
    'ms',
    'engr',
  ].map((s) => applyOcrFixes(s)),
);
/** All spellings of "Mohammad" (after punctuation removal "মোঃ" → "মো"). */
const MOHAMMAD = new Set(
  [
    'মো',
    'মোঃ',
    'মু',
    'মুঃ',
    'মোহাম্মদ',
    'মুহাম্মদ',
    'মোহাম্মাদ',
    'মুহম্মদ',
    'md',
    'mohammad',
    'mohammed',
    'muhammad',
    'mohd',
  ].map((s) => applyOcrFixes(s)),
);
/** Prefixes written with or without a space ("উপ পরিচালক" = "উপপরিচালক"). */
const JOIN_NEXT = new Set(['উপ', 'মহা', 'যুগ্ম'].map((s) => applyOcrFixes(s)));

const PUNCTUATION = /(?:[.,:;()[\]{}"'`‘’“”\-–—।/\\|!?]|ঃ)+/gu;
const JOINERS = /[\u200c\u200d]/g;

/** Normalized tokens of a text (see the file comment). */
export function normalizeTokens(text: string): string[] {
  const words = applyOcrFixes(text)
    .replace(JOINERS, '')
    .toLowerCase()
    .replace(PUNCTUATION, ' ')
    .split(/\s+/u)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (JOIN_NEXT.has(w) && i + 1 < words.length) {
      words[i + 1] = w + words[i + 1];
      continue;
    }
    out.push(w);
  }
  return out;
}

/** Name tokens: without honorifics and without "মো" (written or not, it is the same person). */
export function nameTokens(text: string): string[] {
  return normalizeTokens(text).filter(
    (t) => !HONORIFICS.has(t) && !MOHAMMAD.has(t),
  );
}

interface Span {
  id: string;
  start: number;
  end: number;
}

interface PreparedRef {
  id: string;
  variants: string[][];
}

function prepareRef(ref: NamedRef): PreparedRef {
  return {
    id: ref.id,
    variants: [normalizeTokens(ref.nameBn), normalizeTokens(ref.nameEn)].filter(
      (v) => v.length > 0,
    ),
  };
}

/** Ids of the refs whose name occurs in the line as whole tokens; a name inside a longer found name is ignored. */
function findRefs(tokens: string[], refs: PreparedRef[]): Set<string> {
  const spans: Span[] = [];
  for (const ref of refs) {
    for (const v of ref.variants) {
      for (let i = 0; i + v.length <= tokens.length; i++) {
        if (v.every((t, k) => tokens[i + k] === t))
          spans.push({ id: ref.id, start: i, end: i + v.length });
      }
    }
  }
  const kept = spans.filter(
    (s) =>
      !spans.some(
        (o) =>
          o !== s &&
          o.start <= s.start &&
          s.end <= o.end &&
          o.end - o.start > s.end - s.start,
      ),
  );
  return new Set(kept.map((s) => s.id));
}

interface PreparedOfficer {
  officer: OfficerRecord;
  names: string[][];
  /** (designation, wing) pairs: the main one and every charge (wing defaults to the main wing). */
  posts: Array<{ designationId: string; wingId: string | null }>;
}

export interface OfficerIndex {
  officers: PreparedOfficer[];
  designations: PreparedRef[];
  wings: PreparedRef[];
}

export function buildOfficerIndex(
  officers: ReadonlyArray<OfficerRecord>,
): OfficerIndex {
  const designations = new Map<string, NamedRef>();
  const wings = new Map<string, NamedRef>();
  const prepared = officers.map((officer) => {
    const posts: PreparedOfficer['posts'] = [];
    if (officer.designation) {
      designations.set(officer.designation.id, officer.designation);
      posts.push({
        designationId: officer.designation.id,
        wingId: officer.wing?.id ?? null,
      });
    }
    if (officer.wing) wings.set(officer.wing.id, officer.wing);
    for (const c of officer.charges) {
      designations.set(c.designation.id, c.designation);
      if (c.wing) wings.set(c.wing.id, c.wing);
      posts.push({
        designationId: c.designation.id,
        wingId: c.wing?.id ?? officer.wing?.id ?? null,
      });
    }
    return {
      officer,
      names: [nameTokens(officer.nameBn), nameTokens(officer.nameEn)].filter(
        (n) => n.length > 0,
      ),
      posts,
    };
  });
  return {
    officers: prepared,
    designations: [...designations.values()].map(prepareRef),
    wings: [...wings.values()].map(prepareRef),
  };
}

/** Best similarity of the officer's name with the first tokens of the line (whole line, see top). */
export function nameScore(lineTokens: string[], officerName: string[]): number {
  const name = officerName.join('');
  if (!name || lineTokens.length === 0) return 0;
  let best = 0;
  const n = officerName.length;
  for (let start = 0; start <= 1 && start < lineTokens.length; start++) {
    for (let len = Math.max(1, n - 1); len <= n + 1; len++) {
      if (start + len > lineTokens.length) break;
      const window = lineTokens.slice(start, start + len).join('');
      const s = similarity(window, name) - start * OFFSET_PENALTY;
      if (s > best) best = s;
    }
  }
  return best;
}

export interface MatchInput {
  /** The whole cleaned line (or the chair text). */
  text: string;
  /** Whether the line names a person (parser: a name after "জনাব" etc.). */
  hasName: boolean;
  isGroup: boolean;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function matchLine(input: MatchInput, index: OfficerIndex): LineMatch {
  if (input.isGroup) return { status: 'unmatched', reason: 'group' };
  const tokens = normalizeTokens(input.text);
  const designations = findRefs(tokens, index.designations);
  const wings = findRefs(tokens, index.wings);

  const flags = (o: PreparedOfficer) => {
    const designationMatch = o.posts.some((p) =>
      designations.has(p.designationId),
    );
    const wingMatch = o.posts.some(
      (p) =>
        p.wingId !== null &&
        wings.has(p.wingId) &&
        (designations.size === 0 || designations.has(p.designationId)),
    );
    return { designationMatch, wingMatch };
  };

  if (!input.hasName) {
    if (designations.size === 0)
      return { status: 'unmatched', reason: 'not-found' };
    const fits = index.officers.filter((o) =>
      o.posts.some(
        (p) =>
          designations.has(p.designationId) &&
          (wings.size === 0 || (p.wingId !== null && wings.has(p.wingId))),
      ),
    );
    if (fits.length !== 1)
      return {
        status: 'unmatched',
        reason: fits.length === 0 ? 'not-found' : 'ambiguous',
      };
    const f = flags(fits[0]);
    return {
      status: 'sure',
      candidate: {
        officer: fits[0].officer,
        nameScore: 1,
        score: 1,
        ...f,
        designationMatch: true,
      },
    };
  }

  const line = nameTokens(input.text);
  const scored: MatchCandidate[] = index.officers
    .map((o) => {
      const ns = Math.max(0, ...o.names.map((n) => nameScore(line, n)));
      const f = flags(o);
      const score =
        ns +
        (f.designationMatch ? DESIGNATION_BOOST : 0) +
        (f.wingMatch ? WING_BOOST : 0);
      return {
        officer: o.officer,
        nameScore: round(ns),
        score: round(score),
        ...f,
      };
    })
    .filter((c) => c.nameScore >= MAYBE_NAME_SCORE)
    .sort((a, b) => b.score - a.score || b.nameScore - a.nameScore);

  if (scored.length === 0) return { status: 'unmatched', reason: 'not-found' };
  const [best, second] = scored;
  const clearLead = !second || best.score - second.score >= SURE_MARGIN;
  const strongName =
    best.nameScore >= SURE_NAME_SCORE ||
    (best.nameScore >= SURE_NAME_WITH_DESIGNATION && best.designationMatch);
  if (clearLead && strongName) return { status: 'sure', candidate: best };
  return { status: 'maybe', candidates: scored.slice(0, MAX_MAYBE) };
}
