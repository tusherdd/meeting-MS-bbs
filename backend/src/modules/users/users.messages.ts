export const USER_MESSAGES = {
  notFound: 'ব্যবহারকারী পাওয়া যায়নি।',
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
  designationInactive: 'নির্বাচিত পদবিটি Inactive।',
  wingNotFound: 'নির্বাচিত উইংটি পাওয়া যায়নি।',
  wingInactive: 'নির্বাচিত উইংটি Inactive।',
  fieldRequired: (field: string) => `${field} খালি রাখা যাবে না।`,
  resetInactive:
    'Inactive অ্যাকাউন্টের Password রিসেট করা যাবে না। আগে অ্যাকাউন্টটি Active করুন।',
  passwordResetDone:
    'Password Default Password-এ রিসেট করা হয়েছে, সব সেশন বন্ধ করা হয়েছে এবং ব্যবহারকারীকে Email-এ জানানো হয়েছে।',
} as const;
