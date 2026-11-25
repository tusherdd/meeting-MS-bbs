import type {
  ExtractedChairDto,
  ExtractedParticipantsDto,
  MatchCandidateDto,
  NoticeExtractResponseDto,
} from '../dto/notice-extract.dto';
import type { ExtractWarning, NoticeExtraction } from '../notice-extract.types';
import { parseParticipantLine } from '../parse/notice-parser';
import { warning } from '../parse/notice-warnings';
import {
  buildOfficerIndex,
  matchLine,
  type MatchCandidate,
  type OfficerIndex,
  type OfficerRecord,
} from './officer-matcher';

/**
 * Extraction + officer list → the API response (v1.21, SPEC.md §6.12). Pure.
 * An officer matched "sure" on two lines is kept once (first line) with a warning.
 */

function candidateDto(c: MatchCandidate): MatchCandidateDto {
  const o = c.officer;
  return {
    officer: {
      id: o.id,
      nameBn: o.nameBn,
      nameEn: o.nameEn,
      designation: o.designation,
      wing: o.wing,
    },
    score: c.score,
    designationMatch: c.designationMatch,
    wingMatch: c.wingMatch,
  };
}

function matchChair(
  text: string | null,
  index: OfficerIndex,
): ExtractedChairDto | null {
  if (!text) return null;
  const parsed = parseParticipantLine(text);
  const result = matchLine(
    { text, hasName: parsed.name !== null, isGroup: parsed.isGroup },
    index,
  );
  const base = {
    text,
    name: parsed.name,
    designation: parsed.designation,
    match: null,
    candidates: [],
    reason: null,
  };
  if (result.status === 'sure')
    return { ...base, status: 'sure', match: candidateDto(result.candidate) };
  if (result.status === 'maybe')
    return {
      ...base,
      status: 'maybe',
      candidates: result.candidates.map(candidateDto),
    };
  return { ...base, status: 'unmatched', reason: result.reason };
}

function matchParticipants(
  extraction: NoticeExtraction,
  index: OfficerIndex,
  warnings: ExtractWarning[],
): ExtractedParticipantsDto {
  const out: ExtractedParticipantsDto = { sure: [], maybe: [], unmatched: [] };
  const seen = new Set<string>();
  extraction.participants.forEach((p, i) => {
    const base = {
      line: i + 1,
      text: p.text,
      name: p.name,
      designation: p.designation,
      wing: p.wing,
    };
    const result = matchLine(
      { text: p.text, hasName: p.name !== null, isGroup: p.isGroup },
      index,
    );
    if (result.status === 'sure') {
      const id = result.candidate.officer.id;
      if (seen.has(id)) {
        if (!warnings.some((w) => w.code === 'DUPLICATE_OFFICER'))
          warnings.push(warning('DUPLICATE_OFFICER'));
        return;
      }
      seen.add(id);
      out.sure.push({ ...base, match: candidateDto(result.candidate) });
    } else if (result.status === 'maybe') {
      out.maybe.push({
        ...base,
        candidates: result.candidates.map(candidateDto),
      });
    } else {
      out.unmatched.push({ ...base, reason: result.reason });
    }
  });
  return out;
}

export function buildExtractResponse(
  extraction: NoticeExtraction,
  officers: ReadonlyArray<OfficerRecord>,
): NoticeExtractResponseDto {
  const index = buildOfficerIndex(officers);
  // One warning per code, in the order they were raised.
  const warnings: ExtractWarning[] = [];
  for (const w of extraction.warnings)
    if (!warnings.some((x) => x.code === w.code)) warnings.push(w);
  const chair = matchChair(extraction.chairText, index);
  const participants = matchParticipants(extraction, index, warnings);
  return {
    method: extraction.method,
    fields: extraction.fields,
    chair,
    participants,
    warnings,
  };
}
