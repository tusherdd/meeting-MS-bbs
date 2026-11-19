/**
 * Meeting minutes "সভা কার্যবিবরণী" messages (v1.11 as "decisions", renamed in v1.13; SPEC.md §6.9).
 * English in message-catalog.ts.
 */
export const DECISION_MESSAGES = {
  forbidden:
    'শুধু সভার সংশ্লিষ্ট কর্মকর্তা অথবা প্রশাসক সভা কার্যবিবরণী দেখতে পারেন।',
  uploadForbidden:
    'শুধু সভার আয়োজক, সভাপতি ও সদস্য সভা কার্যবিবরণী Upload করতে পারেন।',
  notStarted: 'সভা শুরু হওয়ার আগে কার্যবিবরণী Upload করা যাবে না।',
  cancelled: 'বাতিল সভার কার্যবিবরণী Upload করা যাবে না।',
  fileMissing: 'অন্তত একটি ফাইল নির্বাচন করুন (ফিল্ডের নাম: files)।',
  badType: (name: string) =>
    `"${name}" ফাইলটি গ্রহণ করা যায়নি: শুধু PDF, DOCX, JPEG অথবা PNG ফাইল Upload করা যাবে।`,
  unreadable: (name: string) =>
    `"${name}" ফাইলটি পড়া যায়নি: ফাইলটি নষ্ট অথবা আসল PDF, DOCX বা ছবি নয়।`,
  /** v1.13: Word files with macros (DOCM or a DOCX with a VBA project). */
  macro: (name: string) =>
    `"${name}" ফাইলটি গ্রহণ করা যায়নি: Macro-যুক্ত Word ফাইল Upload করা যাবে না।`,
  tooLarge: 'প্রতিটি ফাইল সর্বোচ্চ ১০ MB হতে পারে।',
  tooMany: 'একটি সভায় সর্বোচ্চ ১০টি কার্যবিবরণী ফাইল রাখা যায়।',
  fileNotFound: 'কার্যবিবরণী ফাইলটি পাওয়া যায়নি।',
  deleteForbidden:
    'শুধু ফাইলটি যিনি Upload করেছেন, সভার আয়োজক অথবা সভাপতি এটি মুছতে পারেন।',
} as const;
