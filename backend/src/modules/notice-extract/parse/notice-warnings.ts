import type { ExtractWarning } from '../notice-extract.types';

/**
 * Warnings of the notice extraction (v1.21, SPEC.md §6.12). Data for the form, not API errors:
 * `code` is stable (clients may translate it), `message` is Bangla (CLAUDE.md: user text in Bangla).
 */
export const NOTICE_WARNINGS = {
  TITLE_NOT_FOUND: 'নোটিশে সভার শিরোনাম পাওয়া যায়নি।',
  DATE_NOT_FOUND: 'নোটিশে সভার তারিখ পাওয়া যায়নি।',
  TIME_NOT_FOUND: 'নোটিশে সভার সময় পাওয়া যায়নি।',
  TIME_ASSUMED_AFTERNOON:
    'সময়ের সাথে সকাল/বিকাল লেখা নেই; অফিস সময় ধরে দুপুরের পরের সময় নেওয়া হয়েছে। যাচাই করুন।',
  VENUE_NOT_FOUND: 'নোটিশে সভার স্থান পাওয়া যায়নি।',
  AGENDA_NOT_FOUND: 'নোটিশে আলোচ্যসূচি পাওয়া যায়নি।',
  CHAIR_NOT_FOUND: 'নোটিশে সভাপতির নাম পাওয়া যায়নি।',
  DISTRIBUTION_NOT_FOUND: 'নোটিশে বিতরণ তালিকা পাওয়া যায়নি।',
  TEXT_EMPTY: 'ফাইল থেকে কোনো লেখা পড়া যায়নি।',
  OCR_USED:
    'ফাইলটি স্ক্যান করা ছবি; লেখা OCR দিয়ে পড়া হয়েছে। সব তথ্য যাচাই করে নিন।',
  OCR_PAGE_FAILED: 'একটি পৃষ্ঠার লেখা পড়া যায়নি (সময় শেষ বা ত্রুটি)।',
  DUPLICATE_OFFICER:
    'একই কর্মকর্তা বিতরণ তালিকায় একাধিকবার আছেন; একবার রাখা হয়েছে।',
} as const;

export type NoticeWarningCode = keyof typeof NOTICE_WARNINGS;

export function warning(code: NoticeWarningCode): ExtractWarning {
  return { code, message: NOTICE_WARNINGS[code] };
}
