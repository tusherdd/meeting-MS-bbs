export const CHANGE_REQUEST_MESSAGES = {
  typeLabel: { LOGIN_EMAIL: 'Login Email', DESIGNATION: 'পদবি' },
  notFound: 'Change Request-টি পাওয়া যায়নি।',
  onePending:
    'এই বিষয়ে আপনার একটি অনুরোধ ইতিমধ্যে Pending আছে। আগে সেটির সিদ্ধান্ত হোক অথবা বাতিল করুন।',
  notPending: 'এই অনুরোধের ইতিমধ্যে নিষ্পত্তি হয়েছে।',
  superAdmin:
    'Super Admin নিজের অ্যাকাউন্ট সরাসরি সম্পাদনা করতে পারেন; অনুরোধের প্রয়োজন নেই।',
  sameLoginEmail: 'এটিই আপনার বর্তমান Login Email।',
  loginEmailTaken: 'এই Email ইতিমধ্যে অন্য একটি অ্যাকাউন্টে ব্যবহৃত হচ্ছে।',
  designationInvalid: 'নির্বাচিত পদবিটি পাওয়া যায়নি অথবা Inactive।',
  sameDesignation: 'এটিই আপনার বর্তমান পদবি।',
  designationGone:
    'অনুরোধকৃত পদবিটি এখন Inactive অথবা মুছে ফেলা হয়েছে; অনুমোদন দেওয়া যাবে না।',
  ownRequest:
    'নিজের অনুরোধ নিজে অনুমোদন করা যাবে না। অন্য একজন প্রশাসককে অনুমোদন করতে হবে।',
  loginEmailRequired: 'নতুন Login Email দিন।',
  designationRequired: 'নতুন পদবি নির্বাচন করুন।',
  submittedTitle: (typeLabel: string) => `নতুন Change Request: ${typeLabel}`,
  submittedBody: (name: string, typeLabel: string) =>
    `${name} তার ${typeLabel} Change Request করেছেন।`,
  decidedTitle: (typeLabel: string, approved: boolean) =>
    `আপনার ${typeLabel} Change Request ${approved ? 'Approved' : 'Rejected'} হয়েছে`,
  decidedBody: (approved: boolean, note: string | null) =>
    (approved ? 'পরিবর্তনটি কার্যকর করা হয়েছে।' : 'পরিবর্তনটি করা হয়নি।') +
    (note ? ` মন্তব্য: ${note}` : ''),
} as const;
