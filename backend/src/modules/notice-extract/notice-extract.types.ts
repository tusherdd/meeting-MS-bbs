/**
 * Shared types of "fill the meeting form from the notice" (v1.21, SPEC.md §6.12).
 * Pure data: no Nest, no database.
 */

/** How the notice was read: the local OCR extractor or the AI extractor (v1.21 part 2). */
export type ExtractionMethod = 'OCR' | 'AI';

/** A warning for the form; `code` is stable (clients may translate it), `message` is Bangla. */
export interface ExtractWarning {
  code: string;
  message: string;
}

/** The form fields read from the notice. Every field is null when it was not found (never guessed). */
export interface ExtractedFields {
  title: string | null;
  /** Calendar date in Asia/Dhaka, `YYYY-MM-DD`. */
  date: string | null;
  /** `HH:mm`, 24 h, Asia/Dhaka. */
  startTime: string | null;
  /** startTime + 45 min (the form's default duration, v1.18). */
  endTime: string | null;
  venue: string | null;
  /** Keeps the line breaks of the "ক) খ)" items. */
  agenda: string | null;
}

/** One line of the distribution list "বিতরণ", already cleaned. */
export interface ParticipantLine {
  /** The cleaned line (number, "(বিশেষ আমন্ত্রণে)" and the final "।" removed). */
  text: string;
  /** Name after "জনাব" / "বেগম" / "ড." etc.; null when the line has no name. */
  name: string | null;
  designation: string | null;
  /** Wing / office / project part. */
  wing: string | null;
  /** "কর্মকর্তা (সকল), …": a group, never matched to one officer. */
  isGroup: boolean;
}

/** What an extractor returns (before officer matching). */
export interface NoticeExtraction {
  method: ExtractionMethod;
  fields: ExtractedFields;
  /** The raw "সভাপতি" text (name + designation) or null. */
  chairText: string | null;
  participants: ParticipantLine[];
  warnings: ExtractWarning[];
}
