export const USER_MESSAGES = {
  notFound: 'কর্মকর্তা পাওয়া যায়নি।',
  duplicateLoginEmail: 'এই Login Email দিয়ে আগে থেকেই একটি অ্যাকাউন্ট আছে।',
  superAdminProtected:
    'Super Admin অ্যাকাউন্ট শুধু Super Admin নিজেই পরিবর্তন করতে পারেন।',
  superAdminStatusRole:
    'Super Admin-কে Inactive করা বা তার ভূমিকা পরিবর্তন করা যাবে না।',
  superAdminNoDesignation:
    'Super Admin একটি সিস্টেম অ্যাকাউন্ট; এতে পদবি বা উইং দেওয়া যাবে না।',
  selfDeactivate: 'আপনি নিজের অ্যাকাউন্ট Inactive করতে পারবেন না।',
  selfRoleChange: 'আপনি নিজের ভূমিকা (role) পরিবর্তন করতে পারবেন না।',
  designationNotFound: 'নির্বাচিত পদবিটি পাওয়া যায়নি।',
  /** v1.16 structured additional charges. */
  chargeDuplicate: 'একই অতিরিক্ত দায়িত্ব (পদবি ও উইং) দুবার দেওয়া যাবে না।',
  designationInactive: 'নির্বাচিত পদবিটি Inactive।',
  wingNotFound: 'নির্বাচিত উইংটি পাওয়া যায়নি।',
  wingInactive: 'নির্বাচিত উইংটি Inactive।',
  fieldRequired: (field: string) => `${field} খালি রাখা যাবে না।`,
  resetInactive:
    'Inactive অ্যাকাউন্টের Password Reset করা যাবে না। আগে অ্যাকাউন্টটি Active করুন।',
  passwordResetDone:
    'Password Default Password-এ Reset করা হয়েছে, সব Session বন্ধ করা হয়েছে এবং কর্মকর্তাকে Email-এ জানানো হয়েছে।',
} as const;
