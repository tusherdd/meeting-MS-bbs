import type { DecisionFileType } from '../../decisions/decision-file';
import type {
  ExtractionMethod,
  NoticeExtraction,
} from '../notice-extract.types';

/** A checked notice file (same rules as the notice upload), held in memory only. */
export interface NoticeFileInput {
  type: DecisionFileType;
  content: Buffer;
}

/**
 * Turns a notice file into form fields + the people's raw lines (v1.21, SPEC.md §6.12).
 * Pluggable: OcrExtractor (local text layer / OCR + the fixed-format parser) now, an AI extractor
 * in part 2. Officer matching is NOT part of an extractor: it always runs on our server
 * (officer-matcher.ts) on what the extractor returns.
 */
export interface NoticeExtractor {
  readonly method: ExtractionMethod;
  extract(file: NoticeFileInput): Promise<NoticeExtraction>;
}

/** Nest injection token of the active extractor. */
export const NOTICE_EXTRACTOR = Symbol('NOTICE_EXTRACTOR');
