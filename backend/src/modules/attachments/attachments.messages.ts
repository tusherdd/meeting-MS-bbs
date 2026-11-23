import { NOTICE_MESSAGES } from '../notices/notices.messages';

/** v1.17 (SPEC.md §6.11): "অন্যান্য সংযুক্তি" messages. English in message-catalog.ts. */
export const ATTACHMENT_MESSAGES = {
  forbidden:
    'শুধু সভার সংশ্লিষ্ট কর্মকর্তা অথবা প্রশাসক এই সভার সংযুক্তি দেখতে পারেন।',
  changeForbidden: 'শুধু সভার আয়োজক সংযুক্তি যোগ করতে বা বাদ দিতে পারেন।',
  cancelled: 'বাতিল সভায় সংযুক্তি যোগ করা বা বাদ দেওয়া যাবে না।',
  /** Same text (and catalog entry NOTICE_FILE_MISSING) as the notice: the field is `file` too. */
  fileMissing: NOTICE_MESSAGES.fileMissing,
  tooLarge: 'প্রতিটি সংযুক্তি সর্বোচ্চ ১০ MB হতে পারে।',
  tooMany: 'সর্বোচ্চ ৫টি সংযুক্তি যোগ করা যায়।',
  notFound: 'সংযুক্তিটি পাওয়া যায়নি।',
  nameRequired: 'ফাইলের নাম লিখুন।',
  nameTooLong: 'ফাইলের নাম সর্বোচ্চ ১৫০ অক্ষরের হতে পারে।',
} as const;
