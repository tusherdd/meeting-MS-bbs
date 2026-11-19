/** v1.13 (SPEC.md §6.8): uploaded meeting notice messages. English in message-catalog.ts. */
export const NOTICE_MESSAGES = {
  forbidden:
    'শুধু সভার সংশ্লিষ্ট কর্মকর্তা অথবা প্রশাসক এই সভার নোটিশ দেখতে পারেন।',
  changeForbidden:
    'শুধু সভার আয়োজক সভার নোটিশ Upload, পরিবর্তন বা মুছে ফেলতে পারেন।',
  cancelled: 'বাতিল সভার নোটিশ Upload, পরিবর্তন বা মুছে ফেলা যাবে না।',
  fileMissing: 'একটি ফাইল নির্বাচন করুন (ফিল্ডের নাম: file)।',
  tooLarge: 'সভার নোটিশ ফাইল সর্বোচ্চ ১০ MB হতে পারে।',
  notFound: 'এই সভার কোনো নোটিশ ফাইল নেই।',
} as const;
