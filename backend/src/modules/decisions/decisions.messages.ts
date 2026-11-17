/** v1.11 (SPEC.md §6.9): meeting decision messages. English in message-catalog.ts. */
export const DECISION_MESSAGES = {
  forbidden:
    'শুধু সভার সংশ্লিষ্ট কর্মকর্তা অথবা প্রশাসক সভা সিদ্ধান্ত দেখতে পারেন।',
  uploadForbidden:
    'শুধু সভার আয়োজক, সভাপতি ও সদস্য সভা সিদ্ধান্ত Upload করতে পারেন।',
  notStarted: 'সভা শুরু হওয়ার আগে সিদ্ধান্ত Upload করা যাবে না।',
  cancelled: 'বাতিল সভার সিদ্ধান্ত Upload করা যাবে না।',
  fileMissing: 'অন্তত একটি ফাইল নির্বাচন করুন (ফিল্ডের নাম: files)।',
  badType: (name: string) =>
    `"${name}" ফাইলটি গ্রহণ করা যায়নি: শুধু PDF, JPEG অথবা PNG ফাইল Upload করা যাবে।`,
  unreadable: (name: string) =>
    `"${name}" ফাইলটি পড়া যায়নি: ফাইলটি নষ্ট অথবা আসল PDF বা ছবি নয়।`,
  tooLarge: 'প্রতিটি ফাইল সর্বোচ্চ ১০ MB হতে পারে।',
  tooMany: 'একটি সভায় সর্বোচ্চ ১০টি সিদ্ধান্ত ফাইল রাখা যায়।',
  fileNotFound: 'সিদ্ধান্ত ফাইলটি পাওয়া যায়নি।',
  deleteForbidden:
    'শুধু ফাইলটি যিনি Upload করেছেন, সভার আয়োজক অথবা সভাপতি এটি মুছতে পারেন।',
} as const;
