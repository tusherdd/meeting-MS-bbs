/**
 * App-wide settings (v1.21 part 2, SPEC.md §6.13). Pure: keys, allowed values and defaults.
 */

export const NOTICE_EXTRACTION_METHODS = ['OCR', 'AI'] as const;
export type NoticeExtractionMethod = (typeof NOTICE_EXTRACTION_METHODS)[number];

export const SETTING_KEYS = {
  noticeExtractionMethod: 'noticeExtractionMethod',
} as const;

export const SETTING_DEFAULTS = {
  noticeExtractionMethod: 'OCR' as NoticeExtractionMethod,
};

export function isNoticeExtractionMethod(
  value: unknown,
): value is NoticeExtractionMethod {
  return (
    typeof value === 'string' &&
    (NOTICE_EXTRACTION_METHODS as readonly string[]).includes(value)
  );
}
