export const CHANGE_REQUEST_MESSAGES = {
  typeLabel: { LOGIN_EMAIL: 'লগইন ইমেইল', DESIGNATION: 'পদবি' },
  notFound: 'পরিবর্তনের অনুরোধটি পাওয়া যায়নি।',
  onePending:
    'এই বিষয়ে আপনার একটি অনুরোধ ইতিমধ্যে অপেক্ষমাণ আছে। আগে সেটির সিদ্ধান্ত হোক অথবা বাতিল করুন।',
  notPending: 'এই অনুরোধের ইতিমধ্যে নিষ্পত্তি হয়েছে।',
  superAdmin:
    'সুপার অ্যাডমিন নিজের অ্যাকাউন্ট সরাসরি সম্পাদনা করতে পারেন; অনুরোধের প্রয়োজন নেই।',
  sameLoginEmail: 'এটিই আপনার বর্তমান লগইন ইমেইল।',
  loginEmailTaken: 'এই ইমেইল ইতিমধ্যে অন্য একটি অ্যাকাউন্টে ব্যবহৃত হচ্ছে।',
  designationInvalid: 'নির্বাচিত পদবিটি পাওয়া যায়নি অথবা নিষ্ক্রিয়।',
  sameDesignation: 'এটিই আপনার বর্তমান পদবি।',
  designationGone:
    'অনুরোধকৃত পদবিটি এখন নিষ্ক্রিয় অথবা মুছে ফেলা হয়েছে; অনুমোদন দেওয়া যাবে না।',
  ownRequest:
    'নিজের অনুরোধ নিজে অনুমোদন করা যাবে না। অন্য একজন প্রশাসককে অনুমোদন করতে হবে।',
  loginEmailRequired: 'নতুন লগইন ইমেইল দিন।',
  designationRequired: 'নতুন পদবি নির্বাচন করুন।',
  submittedTitle: (typeLabel: string) => `নতুন পরিবর্তনের অনুরোধ: ${typeLabel}`,
  submittedBody: (name: string, typeLabel: string) =>
    `${name} তার ${typeLabel} পরিবর্তনের অনুরোধ করেছেন।`,
  decidedTitle: (typeLabel: string, approved: boolean) =>
    `আপনার ${typeLabel} পরিবর্তনের অনুরোধ ${approved ? 'অনুমোদিত' : 'প্রত্যাখ্যাত'} হয়েছে`,
  decidedBody: (approved: boolean, note: string | null) =>
    (approved ? 'পরিবর্তনটি কার্যকর করা হয়েছে।' : 'পরিবর্তনটি করা হয়নি।') +
    (note ? ` মন্তব্য: ${note}` : ''),
} as const;
